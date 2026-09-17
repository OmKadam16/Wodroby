import type {
  ApparentWeight,
  LayeringRole,
  SleeveLength,
  WarmthLevel,
} from "@/types/wardrobe";

/**
 * How much a look actually covers you, and how much today asks for.
 *
 * The engine used to answer "is this warm enough" by testing whether the
 * temperature fell inside the garment's stored `min_temp_f`..`max_temp_f`.
 * That range is derived from the season set, and the season bands overlap
 * heavily: anything claiming both a cool season and summer ends up spanning
 * 45 to 105. Measured against this wardrobe at 70F, a short-sleeve t-shirt
 * (45-105) and a long-sleeve sweatshirt (15-75) are *both* "in range", both
 * score `degreesOutside === 0`, and the temperature term contributes exactly
 * nothing to telling them apart. That is why a tee, jeans and a cap came back
 * for a 21C morning alongside the sweatshirt, with the same verdict on both.
 *
 * The information needed to separate them was already in the row and simply
 * unread: sleeve length, apparent weight, warmth and layering role. This
 * module turns those into one number per garment, sums it across the pieces
 * that cover the torso, and compares it to what the temperature wants. No
 * model is involved; insulation is a closed-form problem and the attributes
 * are measured, not guessed.
 *
 * Deliberately torso-only. Sleeve length has no counterpart for legs, and
 * inventing one from `sub_category` would be exactly the kind of guess the
 * rest of this codebase refuses to make. Bottoms are still judged by their
 * stored range.
 */

/** Everything this module needs off an item. Structural, so a fixture works. */
export type Insulating = {
  category: string;
  layering_role: LayeringRole;
  sleeve_length: SleeveLength | null;
  apparent_weight: ApparentWeight | null;
  warmth: WarmthLevel | null;
};

/** Categories worn on the upper body. Nothing else contributes. */
const TORSO = new Set(["top", "one_piece", "outerwear"]);

export function coversTorso(item: { category: string }): boolean {
  return TORSO.has(item.category);
}

/*
 * The scale is arbitrary but calibrated, roughly clo x 10. What matters is
 * that the anchors below land where a person would put them:
 *
 *   sleeveless vest, light          0     bare arms, nothing over them
 *   t-shirt, medium, low warmth     2
 *   long-sleeve polo or sweatshirt  6
 *   heavy casual jacket            13.5
 *
 * Every number here comes from the attribute vocabulary the reader already
 * emits, so extending the vocabulary is the only way to need new cases.
 */
const BY_ROLE: Record<LayeringRole, number> = {
  base_layer: 4,
  mid_layer: 6,
  outerwear: 9,
  standalone: 4,
  footwear: 0,
};

const BY_SLEEVE: Record<SleeveLength, number> = {
  sleeveless: -2,
  short: 0,
  three_quarter: 1,
  long: 2,
};

const BY_WEIGHT: Record<ApparentWeight, number> = {
  light: -1.5,
  medium: 0,
  heavy: 2.5,
};

const BY_WARMTH: Record<WarmthLevel, number> = {
  low: -2,
  medium: 0,
  high: 3,
};

/**
 * One garment's contribution, or null when the photo was never read.
 *
 * Null is not zero. A row with no attributes predates the reader, and treating
 * it as weightless would declare every outfit containing it under-dressed.
 * Callers must skip the whole verdict rather than substitute a guess.
 */
export function insulationOf(item: Insulating): number | null {
  if (!coversTorso(item)) return 0;
  if (
    item.sleeve_length === null &&
    item.apparent_weight === null &&
    item.warmth === null
  ) {
    return null;
  }
  const role = BY_ROLE[item.layering_role] ?? 4;
  const sleeve = item.sleeve_length ? BY_SLEEVE[item.sleeve_length] : 0;
  const weight = item.apparent_weight ? BY_WEIGHT[item.apparent_weight] : 0;
  const warmth = item.warmth ? BY_WARMTH[item.warmth] : 0;
  return Math.max(0, role + sleeve + weight + warmth);
}

/**
 * What the torso wants at this temperature.
 *
 * Not linear. A first attempt used a straight line from 85F and it failed its
 * own check at the cold end: it asked for 13.5 at 40F, which a heavy jacket
 * meets on its own, so wearing a sweatshirt underneath scored as *over*
 * dressed. The curve has to steepen as it gets colder, because each further
 * degree costs more insulation than the last.
 *
 * 85F is the zero point: above it no garment helps. The exponent is set by the
 * three judgements most people agree on, and the eval asserts all three —
 * around 70F you want covered arms (4.3, which a long-sleeve polo at 6 meets
 * and a bare t-shirt at 2 does not), around 50F a sweatshirt under a light
 * layer (12.5), and around 40F a sweatshirt under a real jacket (17.1).
 *
 * Wind is the one correction worth making. It strips the still-air layer these
 * numbers assume, and Open-Meteo already reports it.
 */
const NO_INSULATION_ABOVE_F = 85;
const COLD_REFERENCE_F = 30;
const COLD_REFERENCE_INSULATION = 22;

export function targetInsulation(tempF: number, windMph = 0): number {
  const below = NO_INSULATION_ABOVE_F - tempF;
  if (below <= 0) return 0;
  const span = NO_INSULATION_ABOVE_F - COLD_REFERENCE_F;
  const still = (below / span) ** 1.25 * COLD_REFERENCE_INSULATION;
  const wind = windMph >= 15 && tempF < 70 ? 1.5 : 0;
  return Math.min(26, still + wind);
}

/**
 * Slack before a look counts as wrongly dressed, in each direction.
 *
 * Asymmetric on purpose, and for the same reason the penalties are: a layer
 * too many is something you notice and take off, a layer too few is something
 * you feel all day. The wide upper figure also keeps the summer boundary
 * honest — a t-shirt on an 85F day is 2 above a target of 0 and must not be
 * scolded for it.
 *
 * The lower figure was 2 and is 1 because 2 put the boundary in the wrong
 * place. It let a bare short-sleeve shirt pass as "right weight" at 72F while
 * flagging it at 70F, which is a verdict flipping over less than two degrees,
 * and 72F is precisely the morning the report was about. At 1 a bare top is
 * flagged up to about 74F and accepted above it, which is where the line
 * belongs.
 *
 * Where exactly one person wants that line is a matter of taste rather than
 * physics, and taste is the thing this app does not yet know. It is what
 * outfit_feedback is accumulating for.
 */
export const UNDER_TOLERANCE = 1;
export const OVER_TOLERANCE = 3.5;

export type Coverage = {
  worn: number;
  target: number;
  /** Signed: negative is under-dressed, positive is over-dressed. */
  gap: number;
  /** Outside the tolerance band in the cold direction. */
  under: boolean;
  over: boolean;
  hasOuterwear: boolean;
};

/**
 * Judges a whole look, or returns null when it cannot be judged honestly.
 *
 * Null happens two ways and both must stay null: the outfit covers no torso at
 * all (not a shape this engine builds, but cheap to be safe about), or one of
 * its torso pieces was added before the reader existed.
 */
export function coverageOf(
  items: Insulating[],
  tempF: number,
  windMph = 0,
): Coverage | null {
  const torso = items.filter(coversTorso);
  if (torso.length === 0) return null;

  const values: number[] = [];
  for (const item of torso) {
    const value = insulationOf(item);
    if (value === null) return null;
    values.push(value);
  }

  /*
   * Layers do not add up, they overlap. A jacket over a sweatshirt traps much
   * of the same air the sweatshirt already trapped, so counting both in full
   * declares the wearer overdressed on exactly the mornings layering is the
   * right answer. The warmest piece counts whole and each further one counts
   * for less, which is how insulation behaves and how people dress.
   */
  const worn = [...values]
    .sort((a, b) => b - a)
    .reduce((sum, value, i) => sum + value * LAYER_WEIGHTS[Math.min(i, LAYER_WEIGHTS.length - 1)], 0);

  const target = targetInsulation(tempF, windMph);
  const gap = worn - target;
  return {
    worn,
    target,
    gap,
    under: gap < -UNDER_TOLERANCE,
    over: gap > OVER_TOLERANCE,
    hasOuterwear: torso.some((i) => i.category === "outerwear"),
  };
}

const LAYER_WEIGHTS = [1, 0.7, 0.45, 0.3];

/**
 * How much the score should lose for it.
 *
 * Each direction is a fixed cost plus a proportional one, and the fixed part
 * is the important half. Purely proportional was tried first and measured
 * against the real wardrobe: a short-sleeve shirt at 70F sits 2.3 below
 * target, which earned it a 0.6 penalty and left it ranked *above* the
 * long-sleeve sweatshirt, because one accent colour is worth 4 points and
 * formality cohesion is worth 20. Weather is the axis this app is organised
 * around and it was the quietest term in the function.
 *
 * Being wrongly dressed is categorical, not gradual — there is no such thing
 * as slightly having cold arms — so crossing the line costs a flat amount and
 * the distance past it only adds. Under-dressing costs double, because you can
 * take a layer off and you cannot put on one you left at home.
 */
export function coveragePenalty(coverage: Coverage): number {
  if (coverage.under) {
    return Math.min(18, 6 + (-coverage.gap - UNDER_TOLERANCE) * 1.8);
  }
  if (coverage.over) {
    return Math.min(18, 3 + (coverage.gap - OVER_TOLERANCE) * 1.4);
  }
  return 0;
}

/** The sentence the card shows. Positive when the look is dressed for the day,
 *  and specific about the fix when it is not. */
export function coverageVerdict(
  coverage: Coverage,
  tempF: number,
): { text: string; isCompromise: boolean } {
  if (coverage.under) {
    return {
      text: coverage.hasOuterwear
        ? `Still light for ${tempF}°F even with the layer`
        : `Bare for ${tempF}°F — long sleeves or a layer over this`,
      isCompromise: true,
    };
  }
  if (coverage.over) {
    return { text: `Too warm for ${tempF}°F`, isCompromise: true };
  }
  return { text: `Right weight for ${tempF}°F`, isCompromise: false };
}

/**
 * Whether a garment is one the sun, not the thermometer, decides on.
 *
 * Sunglasses were turning up on cool overcast mornings because the only
 * weather axis the engine had was temperature, and 45-105 contains almost
 * every day. The forecast already reports the sky; this is what reads it.
 */
export function needsSun(item: { sub_category: string | null }): boolean {
  return (item.sub_category ?? "").toLowerCase().includes("sunglass");
}
