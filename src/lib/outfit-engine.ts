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
  if (item.rain_ready) return true;
  // Rows written before rain_ready existed carry it in the condition list, and
  // so do item snapshots read back out of outfit_cache, where the field is
  // simply absent. Both are permanent cases, so this fallback stays.
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
  if (req.current_temp_f < OUTERWEAR_EXPECTED_BELOW_F && !hasOuterwear) {
    penalty += 8;
    compromises.push(
      `No layer for ${req.current_temp_f}°F — you'll want a jacket over this`,
    );
  } else if (hasOuterwear) {
    reasons.push("Layered with outerwear");
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

/**
 * How many looks travel to the browser at once.
 *
 * The engine builds every look the wardrobe allows — thousands for a real
 * wardrobe — but each one carries a full copy of its four or five garments, so
 * returning them all meant an 18 MB response for a 31-item wardrobe, to fill a
 * screen that shows six cards. The page is served in slices instead.
 *
 * It lives here rather than beside the server action because a `"use server"`
 * module may only export async functions, and the client needs this number to
 * label its own button.
 */
export const OUTFIT_PAGE_SIZE = 60;

export type GenerateOptions = {
  /** Maximum outfits returned. Omit for every look the wardrobe allows. */
  limit?: number;
};

/**
 * A ceiling on how many looks are built. Not a style judgement — arithmetic.
 *
 * The count is the product of every slot, so it explodes: 30 tops, 25 bottoms,
 * 15 pairs of shoes, 10 layers and 20 accessories is over five million. Below
 * this ceiling every possible look is built; above it, each slot is trimmed to
 * its strongest candidates until the product fits.
 */
const MAX_COMBINATIONS = 4000;

/**
 * Orders looks so the page reads as a wardrobe rather than as a ranking.
 *
 * Sorting by score alone lets a single garment monopolise the whole list. One
 * bold colour among neutrals is worth a flat +4 to every look it appears in
 * (see colorHarmony), so with an otherwise neutral wardrobe *every* top-scoring
 * look contains that one piece — which reads as "why does it keep showing me
 * the same shirt".
 *
 * Grouping by the anchor garment and taking the groups in turn puts each top's
 * best look first, then each top's second best, and so on. Score still decides
 * the order within a group and which group leads.
 */
function interleaveByAnchor(outfits: Outfit[]): Outfit[] {
  const groups = new Map<string, Outfit[]>();
  for (const outfit of outfits) {
    const anchor = outfit.items.find(
      (i) => i.category === "top" || i.category === "one_piece",
    );
    const key = anchor?.id ?? "__no_anchor";
    const group = groups.get(key);
    if (group) group.push(outfit);
    else groups.set(key, [outfit]);
  }

  const byScore = (a: Outfit, b: Outfit) => b.score - a.score || a.id.localeCompare(b.id);
  for (const group of groups.values()) group.sort(byScore);
  const ordered = [...groups.values()].sort((a, b) => byScore(a[0], b[0]));

  const out: Outfit[] = [];
  for (let round = 0; out.length < outfits.length; round++) {
    let added = 0;
    for (const group of ordered) {
      const outfit = group[round];
      if (outfit) {
        out.push(outfit);
        added++;
      }
    }
    if (added === 0) break;
  }
  return out;
}

export function generateOutfits(
  items: WardrobeItemView[],
  req: OutfitRequest,
  options: GenerateOptions = {},
): Outfit[] {
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

  const ranked = (category: string) =>
    pool.filter((p) => p.item.category === category).sort(rank);

  const allTops = ranked("top");
  const allBottoms = ranked("bottom");
  const allOnePieces = ranked("one_piece");
  const allFootwear = ranked("footwear");
  const allOuterwear = ranked("outerwear");
  const allAccessories = ranked("accessory");

  // Anchors are the top+bottom pairs (and one-pieces) — the part of a look a
  // person actually recognises. They are capped first and hardest, because
  // every anchor must survive for the wardrobe to feel represented.
  let anchorCap = Math.max(allTops.length, allBottoms.length, allOnePieces.length);
  const anchorCount = (cap: number) =>
    Math.min(allTops.length, cap) * Math.min(allBottoms.length, cap) +
    Math.min(allOnePieces.length, cap);
  while (anchorCap > 1 && anchorCount(anchorCap) > MAX_COMBINATIONS) anchorCap--;

  const tops = allTops.slice(0, anchorCap);
  const bottoms = allBottoms.slice(0, anchorCap);
  const onePieces = allOnePieces.slice(0, anchorCap);

  // Shoes, layers and accessories are never trimmed. They multiply out fast,
  // so instead of dropping options the best completions of each anchor are
  // kept — which is why a big wardrobe still shows every top, just with fewer
  // variations of the same look.
  const footwear = allFootwear;
  const outerwear = allOuterwear;
  const accessories = allAccessories;

  /*
   * What counts as an outfit: something on the torso, something on the legs,
   * and something on the feet. A top with a bottom covers the first two, and
   * so does a one-piece. Jackets and accessories are additions to that, never
   * a substitute for it.
   *
   * So an anchor is never partial, and shoes below are never optional — a
   * shirt and trousers with nothing on your feet is not a look, it is a list.
   */
  const anchors: Assessment[][] = [];
  for (const top of tops) {
    for (const bottom of bottoms) anchors.push([top, bottom]);
  }
  for (const piece of onePieces) anchors.push([piece]);

  if (anchors.length === 0 || footwear.length === 0) return [];

  /** How many variations of each anchor survive. */
  const perAnchor = Math.max(1, Math.floor(MAX_COMBINATIONS / anchors.length));

  /*
   * Bound the work per anchor as well as the output.
   *
   * Building every completion and then discarding almost all of them is what
   * made a large wardrobe take seconds: 15 pairs of shoes, 10 layers and 20
   * accessories is 3,696 completions per anchor, nearly all thrown away. Keep
   * a pool a few times larger than what survives, and rotate which options
   * each anchor draws from so that across the whole list nothing in the
   * wardrobe goes unworn.
   */
  // Sized to exactly what survives, not larger. A bigger pool would be cut back
  // by score, and completions of the same anchor score so closely that the cut
  // falls on the id tie-break — which deterministically favours the same few
  // accessories and leaves others never worn.
  const poolTarget = perAnchor;
  const completions = (cap: number) =>
    Math.min(footwear.length, cap) *
    (Math.min(outerwear.length, cap) + 1) *
    (Math.min(accessories.length, cap) + 1);
  let optionalCap = Math.max(footwear.length, outerwear.length, accessories.length);
  while (optionalCap > 1 && completions(optionalCap) > poolTarget) optionalCap--;

  /** Optional slots: every option, plus the option of going without. */
  const rotate = (list: Assessment[], offset: number): (Assessment | null)[] => {
    if (list.length === 0) return [null];
    const take = Math.min(list.length, optionalCap);
    const window = Array.from({ length: take }, (_, i) => list[(offset + i) % list.length]);
    return [...window, null];
  };

  /** Shoes are required, so this window has no "without" entry. */
  const rotateRequired = (list: Assessment[], offset: number): Assessment[] => {
    const take = Math.min(list.length, optionalCap);
    return Array.from({ length: take }, (_, i) => list[(offset + i) % list.length]);
  };

  const seen = new Set<string>();
  const outfits: Outfit[] = [];
  const byScore = (a: Outfit, b: Outfit) => b.score - a.score || a.id.localeCompare(b.id);

  for (const [index, base] of anchors.entries()) {
    const built: Outfit[] = [];
    for (const shoe of rotateRequired(footwear, index)) {
      for (const layer of rotate(outerwear, index)) {
        for (const acc of rotate(accessories, index)) {
          const picks = [...base];
          if (shoe) picks.push(shoe);
          if (layer) picks.push(layer);
          if (acc) picks.push(acc);
          if (picks.length === 0) continue;

          const id = outfitId(picks.map((p) => p.item));
          if (seen.has(id)) continue;
          seen.add(id);
          built.push({ id, items: picks.map((p) => p.item), ...evaluate(picks, req) });
        }
      }
    }
    built.sort(byScore);
    outfits.push(...built.slice(0, perAnchor));
  }

  const ordered = interleaveByAnchor(outfits);
  return options.limit === undefined ? ordered : ordered.slice(0, options.limit);
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

  // An outfit needs the torso, the legs and the feet covered, so each of those
  // is reported separately — telling someone they are "missing a top" when
  // they are also missing shoes just sends them back twice.
  const missing: string[] = [];
  if (!has("top") && !has("one_piece")) missing.push("a top or a dress");
  else if (has("top") && !has("bottom") && !has("one_piece")) missing.push("a bottom");
  if (!has("footwear")) missing.push("a pair of shoes");
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
    return `You're missing ${missing.join(" and ")} for a full outfit. Every look needs a top, a bottom and shoes — jackets and accessories are optional extras.`;
  }
  return `Nothing you own is rated close to ${req.current_temp_f}°F. Try All Season pieces or widen a temperature range.`;
}
