/**
 * Colour judgement, as geometry rather than vocabulary.
 *
 * The outfit engine used to decide "bold or neutral" by testing the colour
 * *name* against a hardcoded list. Against a real wardrobe that scored
 * "olive green" and "dark brown" as loud statement colours, because neither
 * string was in the list even though both are as neutral as a colour gets, and
 * it scored "unknown" as loud too, which is a failed reading being counted as
 * a fashion choice.
 *
 * Chroma answers that question directly and for every possible input, which is
 * why this file works in OKLCH and the name is only a fallback for rows written
 * before the coordinates were kept.
 *
 * No React and no database, so the engine, the browser and the eval scripts can
 * all import it. It deliberately does not live in `vision/color.ts`: that
 * module is `"use client"`, and the outfit engine runs on the server.
 */

export type Lch = { l: number; c: number; h: number };

/**
 * The named vocabulary. Every one of these can be chosen by hand in the add
 * dialog, and every one is what the pixel reader snaps to.
 *
 * There is no longer a second list of "neutrals" to keep in step with this one:
 * neutrality is measured from the values below, not asserted next to them.
 */
export const PALETTE: { name: string; rgb: [number, number, number] }[] = [
  { name: "black", rgb: [17, 17, 17] },
  { name: "charcoal", rgb: [58, 58, 58] },
  { name: "grey", rgb: [138, 138, 138] },
  { name: "white", rgb: [255, 255, 255] },
  { name: "off-white", rgb: [242, 240, 234] },
  { name: "ivory", rgb: [255, 255, 240] },
  { name: "cream", rgb: [245, 233, 208] },
  { name: "beige", rgb: [232, 217, 184] },
  { name: "tan", rgb: [203, 163, 106] },
  { name: "khaki", rgb: [176, 160, 106] },
  { name: "brown", rgb: [107, 74, 47] },
  { name: "olive", rgb: [107, 107, 47] },
  { name: "navy", rgb: [31, 42, 82] },
  { name: "denim", rgb: [74, 111, 165] },
  { name: "blue", rgb: [47, 111, 208] },
  { name: "teal", rgb: [31, 143, 143] },
  { name: "green", rgb: [58, 143, 58] },
  { name: "yellow", rgb: [232, 201, 58] },
  { name: "orange", rgb: [224, 122, 47] },
  { name: "red", rgb: [192, 57, 43] },
  { name: "maroon", rgb: [110, 31, 40] },
  { name: "pink", rgb: [232, 143, 174] },
  { name: "purple", rgb: [122, 79, 160] },
];

/** Ordered neutrals-first, which is how wardrobes skew. For the picker. */
export const COLOR_NAMES: string[] = PALETTE.map((entry) => entry.name);

/** sRGB to OKLab, so "nearest colour" means nearest to the eye rather than
 *  nearest in a cube where green swamps everything. */
export function toOklab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Cartesian OKLab to polar OKLCH. Chroma is how much colour, hue is which. */
export function oklabToLch([L, a, b]: [number, number, number]): Lch {
  const c = Math.sqrt(a * a + b * b);
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

const NAME_TO_LCH = new Map<string, Lch>(
  PALETTE.map((entry) => [entry.name, oklabToLch(toOklab(...entry.rgb))]),
);

/** Modifiers that survived from free-text rows. They shift lightness without
 *  changing which colour is meant: "dark brown" is brown. */
const MODIFIERS: Record<string, { dl: number; cs: number }> = {
  light: { dl: 0.12, cs: 0.7 },
  pale: { dl: 0.14, cs: 0.6 },
  bright: { dl: 0.04, cs: 1.25 },
  dark: { dl: -0.12, cs: 1 },
  deep: { dl: -0.14, cs: 1 },
};

/**
 * Resolves any colour string to coordinates.
 *
 * Rows written before the reader kept its numbers carry free text such as
 * "olive green" or "dark brown". Scanning left to right for the first word
 * that names a palette entry gets all of these right: "olive green" is olive
 * rather than green, "navy blue" is navy rather than blue, and "dark brown"
 * reaches brown past a modifier that names no colour at all.
 *
 * Returns null for anything unrecognisable, including the literal "unknown"
 * that the reader writes when it could not tell. Null is not a colour and must
 * never be scored as one.
 */
export function lchForName(raw: string | null | undefined): Lch | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!cleaned || cleaned === "unknown") return null;

  const direct = NAME_TO_LCH.get(cleaned);
  if (direct) return direct;

  const words = cleaned.split(/[\s-]+/);
  let base: Lch | null = null;
  let modifier: { dl: number; cs: number } | null = null;

  for (const word of words) {
    const hit = NAME_TO_LCH.get(word);
    if (hit && !base) base = hit;
    else if (!modifier && MODIFIERS[word]) modifier = MODIFIERS[word];
  }
  if (!base) return null;
  if (!modifier) return base;

  return {
    l: Math.min(1, Math.max(0, base.l + modifier.dl)),
    c: base.c * modifier.cs,
    h: base.h,
  };
}

/** What the engine needs off an item to judge it. Structural, so `WardrobeItem`
 *  and a plain fixture in a script both satisfy it. */
export type ColorBearing = {
  primary_color: string;
  color_l?: number | null;
  color_c?: number | null;
  color_h?: number | null;
};

/**
 * Measured coordinates when the reader kept them, otherwise the name.
 *
 * Correcting the colour by hand clears the measurements, so a human choice
 * always beats a pixel average rather than being silently overruled by it.
 */
export function colorOf(item: ColorBearing): Lch | null {
  const { color_l, color_c, color_h } = item;
  if (
    typeof color_l === "number" &&
    typeof color_c === "number" &&
    typeof color_h === "number"
  ) {
    return { l: color_l, c: color_c, h: color_h };
  }
  return lchForName(item.primary_color);
}

/**
 * Hue families where a wardrobe keeps its neutrals, and the chroma each one
 * tolerates before the colour starts talking.
 *
 * A flat chroma cut cannot work, because the neutrals and the statements share
 * their hues: khaki is a muted yellow (94 against 96), denim is a muted blue
 * (258 against 259), brown is a muted orange (60 against 53). What separates
 * them is how much chroma the eye forgives in that family, and earth tones and
 * indigo are forgiven far more than cyan or magenta. Measured against the
 * palette this classifies all 23 entries the way a person would.
 */
const MUTED_FAMILIES: { from: number; to: number }[] = [
  { from: 40, to: 115 }, // browns, tans, khaki, olive
  { from: 240, to: 285 }, // navy through denim
];
const MUTED_TOLERANCE = 0.1;
const PLAIN_TOLERANCE = 0.055;

/**
 * Neutral means "wears with anything": little enough chroma for its hue, or
 * dark enough or pale enough that whatever chroma remains stops registering.
 *
 * Navy, olive, denim, charcoal and cream all land here without being named,
 * which is the point. The old version asked whether a *string* appeared in a
 * list, so "olive green" and "dark brown" were scored as statement colours.
 */
export function isNeutral(lch: Lch): boolean {
  if (lch.l < 0.22 || lch.l > 0.92) return true;
  const muted = MUTED_FAMILIES.some(
    (band) => lch.h >= band.from && lch.h <= band.to,
  );
  return lch.c < (muted ? MUTED_TOLERANCE : PLAIN_TOLERANCE);
}

/** Shortest angle between two hues, 0 to 180. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** The narrowest arc containing every hue, 0 to 360. */
function hueSpan(hues: number[]): number {
  if (hues.length < 2) return 0;
  const sorted = [...hues].sort((x, y) => x - y);
  let widestGap = 360 - sorted[sorted.length - 1] + sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    widestGap = Math.max(widestGap, sorted[i] - sorted[i - 1]);
  }
  return 360 - widestGap;
}

export type Harmony = {
  /** 0 to 1, fed straight into the outfit score. */
  score: number;
  /** One sentence for the card, or null when there is nothing to say. */
  note: string | null;
};

const ANALOGOUS = 40;
const COMPLEMENTARY = 140;

/**
 * Scores a set of garments on how their colours sit together.
 *
 * The shape of the rules is ordinary colour theory: one strong colour against
 * neutrals reads best, two work when they are either neighbours on the wheel or
 * opposite it, and the band in between is where colours argue. Three strong
 * colours only work when they are deliberately close.
 *
 * The case that prompted this: light blue with orange and red is three accents
 * spread across the wheel, which now scores 0.15 instead of squeaking through.
 */
export function harmony(items: ColorBearing[]): Harmony {
  const resolved = items
    .map((item) => ({ name: item.primary_color, lch: colorOf(item) }))
    .filter((entry): entry is { name: string; lch: Lch } => entry.lch !== null);

  const accents = resolved.filter((entry) => !isNeutral(entry.lch));

  let score: number;
  let note: string | null = null;

  if (accents.length === 0) {
    score = 0.8;
  } else if (accents.length === 1) {
    score = 1;
    note = `${accents[0].name} carries it against neutrals`;
  } else if (accents.length === 2) {
    const d = hueDistance(accents[0].lch.h, accents[1].lch.h);
    if (d <= ANALOGOUS) {
      score = 0.85;
    } else if (d >= COMPLEMENTARY) {
      score = 0.8;
    } else {
      score = 0.35;
      note = `${accents[0].name} and ${accents[1].name} pull against each other`;
    }
  } else {
    const span = hueSpan(accents.map((entry) => entry.lch.h));
    if (span <= 60) {
      score = 0.6;
    } else {
      score = 0.15;
      // Name the two furthest apart: listing all of them reads as a lecture,
      // and the widest pair is the one actually doing the damage.
      let worst: [string, string] = [accents[0].name, accents[1].name];
      let widest = -1;
      for (let i = 0; i < accents.length; i++) {
        for (let j = i + 1; j < accents.length; j++) {
          const d = hueDistance(accents[i].lch.h, accents[j].lch.h);
          if (d > widest) {
            widest = d;
            worst = [accents[i].name, accents[j].name];
          }
        }
      }
      note = `${accents.length} strong colours at once, and ${worst[0]} fights ${worst[1]}`;
    }
  }

  // An outfit where everything sits at the same lightness reads as flat even
  // when the hues agree, so it loses a little without being condemned.
  if (resolved.length >= 2) {
    const ls = resolved.map((entry) => entry.lch.l);
    if (Math.max(...ls) - Math.min(...ls) < 0.12) score *= 0.9;
  }

  return { score, note };
}
