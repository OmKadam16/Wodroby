"use client";

import {
  PALETTE,
  oklabToLch,
  toOklab,
  type Lch,
} from "@/lib/color-harmony";


/**
 * Reads the dominant colour off a garment photo.
 *
 * Deliberately not the vision model's job: CLIP is weak at naming exact
 * colours, and counting pixels is both more accurate and far cheaper.
 *
 * This matters more than it looks. `colorHarmony` in the outfit engine scores
 * an outfit by how many bold colours it combines, and every item added so far
 * was stored as "unknown" — so the scorer has been running on placeholder data
 * and rating every real wardrobe identically.
 */

/** Re-exported so the add dialog keeps one import for everything colour. The
 *  list itself lives with the palette it is built from. */
export { COLOR_NAMES } from "@/lib/color-harmony";

/** Sampling grid. Small on purpose — this is a colour census, not a thumbnail. */
const GRID = 48;

type Lab = [number, number, number];

const PALETTE_LAB = PALETTE.map((entry) => ({ name: entry.name, lab: toOklab(...entry.rgb) }));

function distance(a: Lab, b: Lab): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function nearestName(lab: Lab): string {
  let best = PALETTE_LAB[0].name;
  let bestDistance = Infinity;
  for (const entry of PALETTE_LAB) {
    const d = distance(lab, entry.lab);
    if (d < bestDistance) {
      bestDistance = d;
      best = entry.name;
    }
  }
  return best;
}

export type GarmentColors = {
  primary: string;
  secondary: string[];
  /**
   * The dominant colour's actual coordinates.
   *
   * Snapping to a name and discarding these was the mistake this fixes: the
   * outfit engine needs to know how much colour there is and which, and a name
   * can only be looked up in a list someone has to remember to maintain.
   */
  lch: Lch | null;
};

/**
 * Nothing here modifies the photo — it is drawn to a scratch canvas to be
 * counted, and that canvas is thrown away.
 *
 * With no segmentation step, background pixels would otherwise be counted as
 * though they were fabric. Two cheap defences: the colour that dominates the
 * border is treated as background and discarded, and pixels are weighted by how
 * close to the centre they sit, where the garment almost always is. Both are
 * heuristics and both are wrong sometimes, which is why the result is editable.
 */
export async function extractColors(file: File): Promise<GarmentColors | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = GRID;
    canvas.height = GRID;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, GRID, GRID);
    bitmap.close();

    const { data } = context.getImageData(0, 0, GRID, GRID);
    const labs: (Lab | null)[] = [];
    const border: Lab[] = [];

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const i = (y * GRID + x) * 4;
        if (data[i + 3] < 128) {
          labs.push(null);
          continue;
        }
        const lab = toOklab(data[i], data[i + 1], data[i + 2]);
        labs.push(lab);
        if (x < 2 || y < 2 || x >= GRID - 2 || y >= GRID - 2) border.push(lab);
      }
    }

    const background =
      border.length > 0
        ? (border
            .reduce<Lab>((sum, lab) => [sum[0] + lab[0], sum[1] + lab[1], sum[2] + lab[2]], [0, 0, 0])
            .map((v) => v / border.length) as Lab)
        : null;

    const weights = new Map<string, number>();
    const sums = new Map<string, { l: number; a: number; b: number; w: number }>();
    const centre = (GRID - 1) / 2;
    let counted = 0;

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const lab = labs[y * GRID + x];
        if (!lab) continue;
        // 0.06 in OKLab is roughly "clearly a different colour".
        if (background && distance(lab, background) < 0.0036) continue;

        const dx = (x - centre) / centre;
        const dy = (y - centre) / centre;
        const weight = Math.max(0.15, 1 - (dx * dx + dy * dy) / 2);
        const name = nearestName(lab);
        weights.set(name, (weights.get(name) ?? 0) + weight);
        const sum = sums.get(name) ?? { l: 0, a: 0, b: 0, w: 0 };
        sum.l += lab[0] * weight;
        sum.a += lab[1] * weight;
        sum.b += lab[2] * weight;
        sum.w += weight;
        sums.set(name, sum);
        counted += weight;
      }
    }

    // The border colour swallowed the whole frame: a flat-lay on a plain sheet
    // the same shade as the garment, most likely. Better to say nothing.
    if (counted === 0) return null;

    const ranked = [...weights.entries()].sort((a, b) => b[1] - a[1]);
    const dominant = ranked[0][0];
    // The weighted mean of the pixels that voted for the winning name, rather
    // than the palette entry they snapped to: a sage jumper and a forest one
    // both answer "green" but are not the same colour to wear.
    const mean = sums.get(dominant);
    const lch =
      mean && mean.w > 0
        ? oklabToLch([mean.l / mean.w, mean.a / mean.w, mean.b / mean.w])
        : null;
    return {
      primary: dominant,
      lch,
      // Only colours with a real presence; a stray 3% is noise or a logo.
      secondary: ranked.slice(1, 3).filter(([, w]) => w / counted >= 0.15).map(([name]) => name),
    };
  } catch {
    return null;
  }
}
