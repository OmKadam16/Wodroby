import type { WardrobeItemView } from "@/lib/storage";
import {
  occasionLabel,
  type Formality,
  type Occasion,
  type WardrobeItem,
} from "@/types/wardrobe";

/**
 * Deterministic outfit assembly. No LLM is involved anywhere in this file:
 * candidates come from a SQL query and everything below is plain array
 * filtering plus a fixed scoring function, so the same wardrobe and the same
 * inputs always produce the same outfits in the same order.
 *
 * Nothing here is a hard gate except the shape of the outfit itself. A piece
 * that is off-occasion or rated slightly outside today's temperature is still
 * offered, carrying a note about the compromise, because a wardrobe with three
 * items in it should never return an empty screen.
 */

/** Below this, an outfit without a layer is marked as a compromise. */
export const OUTERWEAR_EXPECTED_BELOW_F = 60;

/** How far outside its rated range a piece may stray before it is ignored. */
export const TEMP_TOLERANCE_F = 15;

const CATEGORY_TOLERANCE: Record<string, number> = {
  top: 15,
  one_piece: 15,
  outerwear: 15,
  bottom: 28,
  footwear: 28,
  accessory: 40,
};

export function toleranceFor(item: WardrobeItem): number {
  return CATEGORY_TOLERANCE[item.category] ?? TEMP_TOLERANCE_F;
}

/** Which formalities read as appropriate when a piece isn't explicitly tagged. */
export const OCCASION_FORMALITY: Record<Occasion, Formality[]> = {
  work: ["business_casual", "formal"],
  business_meeting: ["formal", "business_casual"],
  casual_outing: ["casual"],
  date_night: ["business_casual", "casual", "formal"],
  party: ["casual", "business_casual", "formal"],
  wedding: ["formal", "business_casual"],
  formal_event: ["formal"],
  travel: ["casual", "athletic", "lounge"],
  gym: ["athletic"],
  outdoor_activity: ["athletic", "casual"],
  beach: ["casual", "athletic"],
  lounging: ["lounge", "casual"],
  school: ["casual", "business_casual"],
  religious_service: ["formal", "business_casual"],
};

export type OutfitRequest = {
  current_temp_f: number;
  occasion: Occasion | null;
  is_rainy: boolean;
};

/** How well an outfit answers the request. */
export type MatchLevel = "exact" | "close" | "alternative";

export type Outfit = {
  id: string;
  items: WardrobeItemView[];
  score: number;
  matchLevel: MatchLevel;
  /** Why this works. */
  reasons: string[];
  /** Where it falls short of what was asked for. */
  compromises: string[];
};

type OccasionFit = "tagged" | "in_style" | "off";

type Assessment = {
  item: WardrobeItemView;
  /** Degrees outside the item's own rated range; 0 when comfortably in range. */
  tempOff: number;
  occasionFit: OccasionFit;
  rainSafe: boolean;
};

const NEUTRALS = new Set([
  "black",
  "white",
  "grey",
  "gray",
  "beige",
  "cream",
  "tan",
  "navy",
  "denim",
  "khaki",
  "brown",
  "charcoal",
  "ivory",
  "off-white",
  "olive",
]);

function suitsRain(item: WardrobeItem): boolean {
  return item.suitable_conditions.some((c) => {
    const v = c.toLowerCase();
    return v === "rainy" || v === "rain" || v === "wet";
  });
}

function degreesOutside(item: WardrobeItem, temp: number): number {
  if (temp < item.min_temp_f) return item.min_temp_f - temp;
  if (temp > item.max_temp_f) return temp - item.max_temp_f;
  return 0;
}

function occasionFitOf(item: WardrobeItem, occasion: Occasion | null): OccasionFit {
  if (!occasion) return "tagged";
  if (item.occasions.includes(occasion)) return "tagged";
  if (OCCASION_FORMALITY[occasion].includes(item.formality)) return "in_style";
  return "off";
}

export function assess(item: WardrobeItemView, req: OutfitRequest): Assessment {
  return {
    item,
    tempOff: degreesOutside(item, req.current_temp_f),
    occasionFit: occasionFitOf(item, req.occasion),
    rainSafe: suitsRain(item),
  };
}

/** Wearable today, allowing for the tolerance band — bottoms, shoes and accessories are flexible across seasons. */
export function isWearable(item: WardrobeItem, temp: number): boolean {
  return degreesOutside(item, temp) <= toleranceFor(item);
}

function colorHarmony(items: WardrobeItem[]): number {
  const colors = items.map((i) => i.primary_color.toLowerCase());
  const bold = colors.filter((c) => !NEUTRALS.has(c)).length;
  // One statement colour against neutrals reads best; all-neutral is safe;
  // three or more competing colours is penalised.
  if (bold === 1) return 1;
  if (bold === 0) return 0.8;
  if (bold === 2) return 0.5;
  return 0.2;
}

function formalityCohesion(items: WardrobeItem[]): number {
  const distinct = new Set(items.map((i) => i.formality));
  if (distinct.size === 1) return 1;
  if (distinct.size === 2) return 0.6;
  return 0.25;
}

function tooWarmOrCold(a: Assessment, temp: number): "warm" | "cold" {
  return temp > a.item.max_temp_f ? "warm" : "cold";
}

function evaluate(
  picks: Assessment[],
  req: OutfitRequest,
): Pick<Outfit, "score" | "matchLevel" | "reasons" | "compromises"> {
  const items = picks.map((p) => p.item);
  const reasons: string[] = [];
  const compromises: string[] = [];

  let penalty = 0;

  // --- occasion ---
  if (req.occasion) {
    const label = occasionLabel(req.occasion);
    const off = picks.filter((p) => p.occasionFit === "off");
    const inStyle = picks.filter((p) => p.occasionFit === "in_style");

    // Occasion fit is judged for the outfit as a whole. Wearing three
    // untagged-but-appropriate pieces is one small compromise, not three.
    if (off.length > 0) penalty += 12 + off.length * 5;
    else if (inStyle.length > 0) penalty += 8;

    if (off.length > 0) {
      compromises.push(
        off.length === picks.length
          ? `Nothing here is meant for ${label.toLowerCase()}`
          : `${off.map((p) => p.item.item_name).join(" and ")} doesn't suit ${label.toLowerCase()}`,
      );
    } else if (inStyle.length > 0) {
      compromises.push(
        `Not tagged for ${label.toLowerCase()}, but the right level of dress`,
      );
    } else {
      reasons.push(`Every piece is tagged for ${label.toLowerCase()}`);
    }
  }

  // --- temperature ---
  const stretched = picks.filter((p) => p.tempOff > 0);
  penalty += stretched.reduce((sum, p) => sum + p.tempOff * 1.2, 0);

  if (stretched.length === 0) {
    reasons.push(`Rated for ${req.current_temp_f}°F`);
  } else {
    const worst = [...stretched].sort((a, b) => b.tempOff - a.tempOff)[0];
    const direction = tooWarmOrCold(worst, req.current_temp_f);
    compromises.push(
      `${worst.item.item_name} runs ${direction === "warm" ? "warm" : "light"} for ${req.current_temp_f}°F`,
    );
  }

  const hasOuterwear = items.some((i) => i.category === "outerwear");
  const hasFootwear = items.some((i) => i.category === "footwear");
  if (req.current_temp_f < OUTERWEAR_EXPECTED_BELOW_F && !hasOuterwear) {
    penalty += 8;
    compromises.push(
      `No layer for ${req.current_temp_f}°F — you'll want a jacket over this`,
    );
  } else if (hasOuterwear) {
    reasons.push("Layered with outerwear");
  }
  if (!hasFootwear) {
    penalty += 6;
    compromises.push("No shoes — add a pair to complete the look");
  }

  // --- rain ---
  if (req.is_rainy) {
    const ready = picks.filter((p) => p.rainSafe);
    penalty += (picks.length - ready.length) * 4;
    if (ready.length === picks.length) {
      reasons.push("Every piece handles rain");
    } else if (ready.length === 0) {
      compromises.push("None of this is rain-friendly");
    }
  }

  // --- styling ---
  const harmony = colorHarmony(items);
  const cohesion = formalityCohesion(items);
  if (harmony >= 0.8) reasons.push("Balanced colour palette");
  if (cohesion === 1) {
    reasons.push(`Consistently ${items[0].formality.replace("_", " ")}`);
  }

  const score = Math.max(
    0,
    Math.round((60 + harmony * 20 + cohesion * 20 - penalty) * 10) / 10,
  );

  const matchLevel: MatchLevel =
    compromises.length === 0
      ? "exact"
      : penalty <= 12
        ? "close"
        : "alternative";

  return { score, matchLevel, reasons, compromises };
}

function outfitId(items: WardrobeItem[]): string {
  return items
    .map((i) => i.id)
    .sort()
    .join("|");
}

export type GenerateOptions = {
  /** Maximum outfits returned. */
  limit?: number;
  /** Cap on candidates considered per slot, which bounds the combinations. */
  perSlotLimit?: number;
};

export function seasonFromTemp(temp: number, isRainy: boolean): string {
  if (isRainy) return "rainy";
  if (temp >= 68) return "summer";
  if (temp <= 55) return "winter";
  if (temp >= 30 && temp <= 90) return "all-season";
  return "mid";
}

export function generateOutfits(
  items: WardrobeItemView[],
  req: OutfitRequest,
  options: GenerateOptions = {},
): Outfit[] {
  const limit = options.limit ?? 18;
  const perSlot = options.perSlotLimit ?? 8;

  const pool = items
    .filter((item) => isWearable(item, req.current_temp_f))
    .map((item) => assess(item, req));

  // Best candidates first, so the per-slot cut keeps the strongest pieces.
  // Every comparison ends in an id tie-break to keep the order stable.
  const FIT_RANK: Record<OccasionFit, number> = {
    tagged: 0,
    in_style: 1,
    off: 2,
  };
  const rank = (a: Assessment, b: Assessment) => {
    const fit = FIT_RANK[a.occasionFit] - FIT_RANK[b.occasionFit];
    if (fit !== 0) return fit;
    if (req.is_rainy) {
      const rain = Number(b.rainSafe) - Number(a.rainSafe);
      if (rain !== 0) return rain;
    }
    if (a.tempOff !== b.tempOff) return a.tempOff - b.tempOff;
    return a.item.id.localeCompare(b.item.id);
  };

  const bucket = (category: string) =>
    pool
      .filter((p) => p.item.category === category)
      .sort(rank)
      .slice(0, perSlot);

  const tops = bucket("top");
  const bottoms = bucket("bottom");
  const onePieces = bucket("one_piece");
  const footwear = bucket("footwear");
  const outerwear = bucket("outerwear");
  const accessories = bucket("accessory");

  const layers: (Assessment | null)[] =
    outerwear.length > 0 ? [...outerwear, null] : [null];
  const addOns: (Assessment | null)[] =
    accessories.length > 0 ? [...accessories, null] : [null];
  const shoes: (Assessment | null)[] =
    footwear.length > 0 ? [...footwear, null] : [null];

  const combos: Assessment[][] = [];
  for (const shoe of shoes) {
    for (const layer of layers) {
      for (const acc of addOns) {
        for (const top of tops) {
          for (const bottom of bottoms) {
            const base: Assessment[] = [top, bottom];
            if (shoe) base.push(shoe);
            const withLayer = layer ? [...base, layer] : base;
            combos.push(acc ? [...withLayer, acc] : withLayer);
          }
        }
        for (const piece of onePieces) {
          const base: Assessment[] = [piece];
          if (shoe) base.push(shoe);
          const withLayer = layer ? [...base, layer] : base;
          combos.push(acc ? [...withLayer, acc] : withLayer);
        }
        if (tops.length === 0 && bottoms.length === 0 && onePieces.length === 0 && (shoe || layer || acc)) {
          const solo: Assessment[] = [];
          if (shoe) solo.push(shoe);
          if (layer) solo.push(layer);
          if (acc) solo.push(acc);
          if (solo.length > 0) combos.push(solo);
        }
      }
    }
  }

  const seen = new Set<string>();
  const outfits: Outfit[] = [];

  for (const combo of combos) {
    const picks = [...combo];
    const id = outfitId(picks.map((p) => p.item));
    if (seen.has(id)) continue;
    seen.add(id);
    outfits.push({ id, items: picks.map((p) => p.item), ...evaluate(picks, req) });
  }

  outfits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return outfits.slice(0, limit);
}

/**
 * What the wardrobe is short of. Only the outfit *shape* can make generation
 * impossible, so this reports the missing slot rather than a failed filter.
 */
export function missingSlots(items: WardrobeItem[], temp?: number): string[] {
  const pool =
    typeof temp === "number"
      ? items.filter((i) => isWearable(i, temp))
      : items;
  const has = (c: string) => pool.some((i) => i.category === c);

  const missing: string[] = [];
  if (!has("top") && !has("one_piece") && !has("bottom") && !has("footwear") && !has("accessory")) {
    return ["a top or a dress"];
  }
  if (!has("top") && !has("one_piece")) missing.push("a top or a dress");
  else if (has("top") && !has("bottom") && !has("one_piece")) missing.push("a bottom");
  return missing;
}

export function explainEmptyResult(
  items: WardrobeItem[],
  req: OutfitRequest,
): string {
  if (items.length === 0) {
    return "Your wardrobe is empty. Add a few pieces and come back.";
  }
  const missing = missingSlots(items);
  if (missing.length > 0) {
    return `You're missing ${missing.join(" and ")} for a full outfit — add one and you'll get looks right away. Shoes are now optional, so top + bottom is enough.`;
  }
  return `Nothing you own is rated close to ${req.current_temp_f}°F. Try All Season pieces or widen a temperature range.`;
}
