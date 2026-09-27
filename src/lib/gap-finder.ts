import type { WeatherBin } from "@/lib/climate";
import type { WardrobeItemView } from "@/lib/storage";
import {
  generateOutfits,
  OCCASION_FORMALITY,
  type OutfitRequest,
} from "@/lib/outfit-engine";
import { conditionsFor, deriveSeasons, seasonsToTempRange } from "@/lib/seasons";
import { CATEGORY_ENTRIES } from "@/lib/vision/prompts";
import {
  OCCASIONS,
  type ApparentWeight,
  type Formality,
  type Occasion,
  type SleeveLength,
  type WarmthLevel,
} from "@/types/wardrobe";

/**
 * "What should I buy next?", answered by arithmetic.
 *
 * Every candidate below is a plain, generic piece. Each is added to the
 * wardrobe on paper, the ordinary outfit engine is run across a year of the
 * wearer's own weather, and the candidate is worth the days on which it turns
 * "nothing is a clean match" into at least one Spot on look. No model, no
 * catalogue, no taste: whether a warm layer would get used in January is a
 * question the engine already answers every morning, just one day at a time.
 *
 * The candidates go through the same season derivation a real upload does,
 * so the engine sees exactly the row it would see if one were bought and
 * photographed. They are all neutral colours on purpose — a neutral is the
 * one colour that can be recommended without knowing anyone's taste — and
 * each is tagged for every occasion its formality suits, the way a wearer
 * would tag it on the way in.
 */

type Candidate = {
  id: string;
  label: string;
  /** Row key in CATEGORY_ENTRIES — where category, role and seasons come from. */
  entry: string;
  sleeve: SleeveLength | null;
  weight: ApparentWeight | null;
  warmth: WarmthLevel | null;
  formality: Formality;
  color: string;
  rainReady?: boolean;
};

const CANDIDATES: Candidate[] = [
  { id: "tee", label: "A plain T-shirt", entry: "t_shirt", sleeve: "short", weight: "light", warmth: "low", formality: "casual", color: "white" },
  { id: "shirt", label: "A long-sleeve shirt", entry: "shirt", sleeve: "long", weight: "light", warmth: "low", formality: "business_casual", color: "white" },
  { id: "sweater", label: "A warm sweater", entry: "sweater", sleeve: "long", weight: "heavy", warmth: "high", formality: "casual", color: "grey" },
  { id: "hoodie", label: "A hoodie", entry: "hoodie", sleeve: "long", weight: "medium", warmth: "medium", formality: "casual", color: "grey" },
  { id: "jeans", label: "A pair of jeans", entry: "jeans", sleeve: null, weight: "medium", warmth: "medium", formality: "casual", color: "denim" },
  { id: "trousers", label: "Tailored trousers", entry: "trousers", sleeve: null, weight: "medium", warmth: "medium", formality: "business_casual", color: "navy" },
  { id: "shorts", label: "A pair of shorts", entry: "shorts", sleeve: null, weight: "light", warmth: "low", formality: "casual", color: "beige" },
  { id: "joggers", label: "Joggers", entry: "joggers", sleeve: null, weight: "medium", warmth: "medium", formality: "athletic", color: "black" },
  { id: "dress", label: "A simple dress", entry: "dress", sleeve: "short", weight: "light", warmth: "low", formality: "casual", color: "black" },
  { id: "light_jacket", label: "A light jacket", entry: "jacket", sleeve: "long", weight: "light", warmth: "low", formality: "casual", color: "navy" },
  { id: "rain_jacket", label: "A rain jacket", entry: "windbreaker", sleeve: "long", weight: "light", warmth: "low", formality: "casual", color: "navy", rainReady: true },
  { id: "coat", label: "A warm winter coat", entry: "coat", sleeve: "long", weight: "heavy", warmth: "high", formality: "business_casual", color: "charcoal" },
  { id: "blazer", label: "A blazer", entry: "blazer", sleeve: "long", weight: "medium", warmth: "medium", formality: "business_casual", color: "navy" },
  { id: "sneakers", label: "Everyday sneakers", entry: "sneakers", sleeve: null, weight: "medium", warmth: "low", formality: "casual", color: "white" },
  { id: "boots", label: "Waterproof boots", entry: "boots", sleeve: null, weight: "heavy", warmth: "medium", formality: "casual", color: "brown", rainReady: true },
  { id: "loafers", label: "Smart shoes", entry: "loafers", sleeve: null, weight: "medium", warmth: "low", formality: "business_casual", color: "brown" },
  { id: "sports_shoes", label: "Sports shoes", entry: "sports_shoes", sleeve: null, weight: "medium", warmth: "low", formality: "athletic", color: "black" },
];

export type GapSuggestion = {
  id: string;
  label: string;
  /** Extra days a year with a Spot on look, across every occasion counted. */
  daysGained: number;
  /** The same, split by occasion. `null` is "anything". Only non-zero rows. */
  byOccasion: { occasion: Occasion | null; days: number }[];
  /** The coolest and warmest band centres the gain comes from. */
  fromF: number;
  toF: number;
  /** Rainy days make up at least half of the gain. */
  mostlyRain: boolean;
};

export type GapReport = {
  suggestions: GapSuggestion[];
  /** Days in the year that were counted. */
  daysCounted: number;
  /** Occasions judged, beyond "anything". */
  occasions: Occasion[];
};

function candidateItem(c: Candidate, userId: string): WardrobeItemView | null {
  const entry = CATEGORY_ENTRIES.find((e) => e.id === c.entry);
  if (!entry) return null;
  const seasons = deriveSeasons({
    base: entry.seasons,
    category: entry.category,
    sleeveLength: c.sleeve,
    apparentWeight: c.weight,
    warmth: c.warmth,
    layeringRole: entry.layering_role,
  });
  const { min, max } = seasonsToTempRange(seasons);
  return {
    id: `candidate:${c.id}`,
    user_id: userId,
    image_url: "",
    original_image_url: null,
    display_url: "",
    item_name: c.label,
    category: entry.category,
    sub_category: entry.sub_category,
    primary_color: c.color,
    secondary_colors: [],
    formality: c.formality,
    seasons,
    rain_ready: Boolean(c.rainReady),
    sleeve_length: c.sleeve,
    color_l: null,
    color_c: null,
    color_h: null,
    apparent_weight: c.weight,
    warmth: c.warmth,
    min_temp_f: min,
    max_temp_f: max,
    suitable_conditions: conditionsFor(seasons, Boolean(c.rainReady)),
    occasions: OCCASIONS.filter((o) => OCCASION_FORMALITY[o].includes(c.formality)),
    wear_notes: null,
    layering_role: entry.layering_role,
    created_at: "",
    in_wash_since: null,
  };
}

/**
 * Whether a piece could appear in a Spot on look at all.
 *
 * Spot on means no compromise, and two compromises are decided by a single
 * piece: being outside its own temperature range, and — when an occasion is
 * asked — not being tagged for it. Anything that fails either can never be in
 * a Spot on look, so it is dropped before the engine runs rather than
 * assembled into hundreds of looks that were never going to qualify. That is
 * most of the cost of this whole search.
 *
 * Dropping pieces also loosens the engine's caps, so this can find a Spot on
 * look that the full list would have trimmed away. It does so equally with and
 * without the candidate, which is all the comparison needs.
 */
function couldBeSpotOn(item: WardrobeItemView, req: OutfitRequest): boolean {
  if (req.current_temp_f < item.min_temp_f || req.current_temp_f > item.max_temp_f) return false;
  return !req.occasion || item.occasions.includes(req.occasion);
}

function hasSpotOn(
  items: WardrobeItemView[],
  req: OutfitRequest,
  mustInclude?: string,
): boolean {
  const eligible = items.filter((i) => couldBeSpotOn(i, req));
  return generateOutfits(eligible, req, { mustInclude }).some((o) => o.matchLevel === "exact");
}

/**
 * Ranks the candidates by the days they would add.
 *
 * The expensive part is the engine, so it is only run where a candidate could
 * change the answer: a day already covered cannot gain, and a piece that is
 * not wearable at a temperature cannot be in any look there. Both are decided
 * before generating anything.
 */
export function findGaps(
  wardrobe: WardrobeItemView[],
  bins: WeatherBin[],
  userId: string,
  limit = 3,
): GapReport {
  const occasions = OCCASIONS.filter((o) =>
    wardrobe.some((i) => i.occasions.includes(o)),
  );
  const asked: (Occasion | null)[] = [null, ...occasions];
  const requestFor = (bin: WeatherBin, occasion: Occasion | null): OutfitRequest => ({
    current_temp_f: bin.temp_f,
    occasion,
    is_rainy: bin.rainy,
  });

  // What the wardrobe already covers, once per band and occasion.
  const covered = new Map<string, boolean>();
  const key = (bin: WeatherBin, occasion: Occasion | null) =>
    `${bin.temp_f}|${bin.rainy}|${occasion ?? "-"}`;
  for (const bin of bins) {
    for (const occasion of asked) {
      covered.set(key(bin, occasion), hasSpotOn(wardrobe, requestFor(bin, occasion)));
    }
  }

  const suggestions: GapSuggestion[] = [];
  for (const candidate of CANDIDATES) {
    const item = candidateItem(candidate, userId);
    if (!item) continue;
    const withIt = [...wardrobe, item];

    const byOccasion = new Map<Occasion | null, number>();
    let gained = 0;
    let rainDays = 0;
    let fromF = Infinity;
    let toF = -Infinity;

    for (const bin of bins) {
      for (const occasion of asked) {
        if (covered.get(key(bin, occasion))) continue;
        if (!couldBeSpotOn(item, requestFor(bin, occasion))) continue;
        // Only a look that wears the candidate can be new: the band had no
        // Spot on look without it.
        if (!hasSpotOn(withIt, requestFor(bin, occasion), item.id)) continue;
        gained += bin.days;
        if (bin.rainy) rainDays += bin.days;
        byOccasion.set(occasion, (byOccasion.get(occasion) ?? 0) + bin.days);
        fromF = Math.min(fromF, bin.temp_f);
        toF = Math.max(toF, bin.temp_f);
      }
    }

    if (gained === 0) continue;
    suggestions.push({
      id: candidate.id,
      label: candidate.label,
      daysGained: gained,
      byOccasion: asked
        .filter((o) => (byOccasion.get(o) ?? 0) > 0)
        .map((o) => ({ occasion: o, days: byOccasion.get(o)! }))
        .sort((a, b) => b.days - a.days),
      fromF,
      toF,
      mostlyRain: rainDays * 2 >= gained,
    });
  }

  suggestions.sort((a, b) => b.daysGained - a.daysGained || a.id.localeCompare(b.id));
  return {
    suggestions: suggestions.slice(0, limit),
    daysCounted: bins.reduce((sum, b) => sum + b.days, 0),
    occasions,
  };
}
