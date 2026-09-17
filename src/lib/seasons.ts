import {
  isSeason,
  SEASONS,
  SEASON_LABELS,
  type ApparentWeight,
  type Category,
  type Condition,
  type LayeringRole,
  type Season,
  type SleeveLength,
  type WarmthLevel,
} from "@/types/wardrobe";

/**
 * Everything the app knows about seasons lives here.
 *
 * Two vocabularies, one direction of derivation: `seasons` is what the user
 * picks and what the wardrobe shows, and the temperature range is *derived*
 * from it at write time. The outfit engine still scores in degrees — it needs
 * a continuous number, not four buckets — so the range stays, but it is an
 * output now, never an input. Only `seasonsToTempRange` may write it.
 */

// ------------------------------------------------------------------
// Bands
// ------------------------------------------------------------------

/** What a season means in degrees when writing a garment. Chosen so the new
 *  write path reproduces the ranges the old one produced: [summer] is 68-105,
 *  [winter] is 15-55, [spring,fall] is 45-75. */
export const SEASON_TEMP_BANDS: Record<Season, { min: number; max: number }> = {
  spring: { min: 45, max: 75 },
  summer: { min: 68, max: 105 },
  fall: { min: 45, max: 75 },
  winter: { min: 15, max: 55 },
};

/** Non-overlapping bands used only to read seasons *back* out of a legacy
 *  temperature range. Deliberately narrower than the write bands so a summer
 *  piece does not claim spring on a two-degree overlap.
 *
 *  This is the TypeScript twin of the backfill CASE in
 *  `supabase/migrations/0005_seasons.sql`. Same bands, same threshold — if you
 *  change one, change the other. */
const SEASON_CLAIM_BANDS: Record<Season, { min: number; max: number }> = {
  spring: { min: 45, max: 70 },
  summer: { min: 70, max: 105 },
  fall: { min: 45, max: 70 },
  winter: { min: 15, max: 45 },
};

/** How much of a claim band a range must cover to count.
 *
 *  Tuned against the wardrobe as it actually is, not against the four ranges
 *  the add dialog produced — the rows in this database came from an earlier
 *  vision pass and sit on multiples of five, so every borderline case lands on
 *  exactly 10 (a 35-70 leather jacket grazing winter, 50-80 jeans grazing
 *  summer, a 60-85 t-shirt grazing the shoulders). At 12 all three lose a
 *  season they plainly belong to.
 *
 *  The cost: a range of exactly 15-55 now also claims spring and fall, where
 *  12 would have said winter alone. No such row exists, and only rows written
 *  before this migration are read this way at all. */
const CLAIM_OVERLAP_F = 10;

// ------------------------------------------------------------------
// Converting between seasons and degrees
// ------------------------------------------------------------------

export function seasonsToTempRange(seasons: Season[]): { min: number; max: number } {
  // Unstated is the old all-season default rather than an empty range, so a
  // row written without seasons is still wearable rather than invisible.
  if (seasons.length === 0) return { min: 30, max: 90 };
  return {
    min: Math.min(...seasons.map((s) => SEASON_TEMP_BANDS[s].min)),
    max: Math.max(...seasons.map((s) => SEASON_TEMP_BANDS[s].max)),
  };
}

/** Reads seasons out of a legacy temperature range. Only used as a fallback
 *  for rows written before seasons existed — see `itemSeasons`. */
export function seasonsFromTempRange(minF: number, maxF: number): Season[] {
  const claimed = SEASONS.filter((season) => {
    const band = SEASON_CLAIM_BANDS[season];
    return Math.min(maxF, band.max) - Math.max(minF, band.min) >= CLAIM_OVERLAP_F;
  });
  if (claimed.length > 0) return [...claimed];

  // A narrow hand-set band overlapped nothing enough. Place it by its midpoint
  // rather than leaving the item with no season at all.
  const mid = (minF + maxF) / 2;
  if (mid < 45) return ["winter"];
  if (mid > 72) return ["summer"];
  return ["spring", "fall"];
}

/**
 * The only supported way to read an item's seasons.
 *
 * Covers three cases at once that would otherwise each be a crash: rows
 * written before the migration, rows written by an older client during a
 * rollout, and item snapshots read back out of `outfit_cache`, which are
 * frozen JSON and may predate the column entirely.
 */
export function itemSeasons(item: {
  seasons?: string[] | null;
  min_temp_f: number;
  max_temp_f: number;
}): Season[] {
  const stored = (item.seasons ?? []).filter(isSeason);
  return stored.length > 0 ? stored : seasonsFromTempRange(item.min_temp_f, item.max_temp_f);
}

/** Keeps the legacy `suitable_conditions` column coherent. Derived, so the
 *  client never has to think about it. */
export function conditionsFor(seasons: Season[], rainReady: boolean): Condition[] {
  const out = new Set<Condition>();
  for (const season of seasons) {
    if (season === "summer") ["sunny", "hot", "humid"].forEach((c) => out.add(c as Condition));
    else if (season === "winter") ["cold", "snowy", "cloudy"].forEach((c) => out.add(c as Condition));
    else ["sunny", "cloudy"].forEach((c) => out.add(c as Condition));
  }
  if (rainReady) out.add("rainy");
  return [...out];
}

// ------------------------------------------------------------------
// Display
// ------------------------------------------------------------------

/** Three seasons will not fit beside the category in an 11px truncated line,
 *  so describe the set rather than listing it. */
export function seasonSummary(seasons: Season[]): string {
  if (seasons.length === 0 || seasons.length === 4) return "All year";
  const ordered = SEASONS.filter((s) => seasons.includes(s));
  if (ordered.length === 1) return SEASON_LABELS[ordered[0]];
  if (ordered.length === 2) {
    return `${SEASON_LABELS[ordered[0]]} & ${SEASON_LABELS[ordered[1]]}`;
  }
  const missing = SEASONS.find((s) => !seasons.includes(s))!;
  return `All but ${SEASON_LABELS[missing].toLowerCase()}`;
}

/**
 * Which season it is right now, for the outfits page badge.
 *
 * Spring and fall share a temperature band, so no function of temperature
 * alone can tell them apart — the date is the missing input. A freak day
 * overrides the calendar so the badge agrees with the sky.
 *
 * Read by the outfits badge and by one term in the engine, which gives a small
 * bonus to a garment picked for today's season over one merely tolerant of it.
 * That is the whole of its influence on scoring, and it is deliberately small:
 * this is a calendar, so it is a northern-hemisphere assumption, and the
 * weather judgement that actually decides whether a look is warm enough is
 * made from measured attributes in lib/insulation.ts instead.
 */
export function seasonForToday(tempF: number, date = new Date()): Season {
  if (tempF >= 80) return "summer";
  if (tempF <= 40) return "winter";
  const month = date.getMonth();
  if (month === 11 || month <= 1) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "fall";
}

// ------------------------------------------------------------------
// Deriving seasons from the garment and the photo
// ------------------------------------------------------------------

export type DeriveSeasonsInput = {
  /** What this kind of garment is worn in, before the photo is considered.
   *  Comes from the vocabulary entry — see CATEGORY_ENTRIES. */
  base: Season[];
  category: Category;
  sleeveLength: SleeveLength | null;
  apparentWeight: ApparentWeight | null;
  warmth: WarmthLevel | null;
  layeringRole: LayeringRole;
};

/**
 * Decides which seasons a garment belongs to.
 *
 * Application logic, not model output: the model reports what it can see, and
 * this decides what that means for the calendar. Keeping them apart means
 * these rules can be tuned without retraining or swapping the model.
 *
 * The garment type leads and the photo only narrows. That ordering is the
 * point — a parka is never a summer coat however it was photographed, and no
 * attribute reading, right or wrong, can add a season the type does not have.
 * Attributes can only ever remove one, which also means a misread attribute
 * costs a season rather than inventing a nonsensical one.
 *
 * The result is a suggestion. The dialog pre-selects it, the user can change
 * it, and what is stored is their final answer with no marker saying where it
 * came from — so tuning these rules never rewrites anyone's wardrobe.
 */
export function deriveSeasons(input: DeriveSeasonsInput): Season[] {
  const { base, category, sleeveLength, apparentWeight, warmth, layeringRole } = input;
  const start = base.length > 0 ? base : [...SEASONS];

  // Bottoms and accessories are worn across the year — the outfit engine
  // already treats them as season-flexible via CATEGORY_TOLERANCE, and a photo
  // of jeans says nothing useful about when they come out of the drawer.
  if (category === "bottom" || category === "accessory") return [...start];

  const drop = new Set<Season>();

  const outerLayer = layeringRole === "outerwear" || layeringRole === "mid_layer";
  // Heavy fabric only rules out summer for something worn on top. A thick
  // t-shirt is still a t-shirt.
  if (warmth === "high" || (apparentWeight === "heavy" && outerLayer)) drop.add("summer");
  // Both heavy AND warm, worn on top: that is a cold-weather layer, not
  // something reached for in spring. Weight is what separates it from a warm
  // midweight hoodie, which is very much a spring layer.
  if (outerLayer && warmth === "high" && apparentWeight === "heavy") drop.add("spring");
  if (
    apparentWeight === "light" ||
    warmth === "low" ||
    sleeveLength === "sleeveless" ||
    // Bare arms are bare arms. A short-sleeve top is not a winter garment on
    // its own, whatever the fabric weighs.
    sleeveLength === "short"
  ) {
    drop.add("winter");
  }
  // Covered arms in anything but a light fabric is not what anyone reaches for
  // in summer. Without this, a medium-weight, medium-warmth long-sleeve keeps
  // all four seasons, which is how half this wardrobe ended up rated 15 to 105
  // and invisible to the forecast.
  if (sleeveLength === "long" && apparentWeight !== "light") drop.add("summer");

  const kept = start.filter((s) => !drop.has(s));
  // Never leave a garment with no season at all; contradictory readings mean
  // the photo was unclear, so fall back to what the garment type says.
  return kept.length > 0 ? kept : [...start];
}
