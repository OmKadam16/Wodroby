"use client";

import {
  attributesForCategory,
  classifyEmbedding,
  type ClothingAnalysis,
} from "@/lib/vision/classify";
import { extractColors } from "@/lib/vision/color";
import { embedImage, getEmbeddingTable } from "@/lib/vision/model";
import type { CategoryEntry } from "@/lib/vision/prompts";
import { deriveSeasons } from "@/lib/seasons";
import type {
  ApparentWeight,
  Category,
  Formality,
  LayeringRole,
  Season,
  SleeveLength,
  WarmthLevel,
} from "@/types/wardrobe";

/**
 * The whole pipeline, in the order the request described it:
 *
 *   photo -> MobileCLIP2-S0 -> identification -> attributes -> seasons
 *
 * The photo is only ever read. Nothing here writes an image, and the file the
 * user picked is the file that gets uploaded.
 */

export type GarmentReading = {
  analysis: ClothingAnalysis;
  primaryColor: string | null;
  secondaryColors: string[];
};

/** Everything a draft needs, once a category is settled. */
export type GarmentSuggestion = {
  category: Category;
  subCategory: string;
  layeringRole: LayeringRole;
  sleeveLength: SleeveLength | null;
  apparentWeight: ApparentWeight | null;
  warmth: WarmthLevel | null;
  formality: Formality | null;
  seasons: Season[];
};

/**
 * Returns null when the model is unavailable or the photo could not be read.
 * That is not an error state — it just means the form stays entirely manual.
 */
export async function readGarment(file: File): Promise<GarmentReading | null> {
  // Colour does not need the model, so it should not wait for a 45 MB
  // download; if the model never arrives the colour is still worth having.
  const [embedding, table, colors] = await Promise.all([
    embedImage(file),
    getEmbeddingTable(),
    extractColors(file),
  ]);

  if (!embedding || !table) {
    return colors
      ? {
          analysis: {
            category: null,
            categoryOptions: [],
            sleeveLength: null,
            apparentWeight: null,
            warmth: null,
            formality: null,
          },
          primaryColor: colors.primary,
          secondaryColors: colors.secondary,
        }
      : null;
  }

  return {
    analysis: classifyEmbedding(embedding, table),
    primaryColor: colors?.primary ?? null,
    secondaryColors: colors?.secondary ?? [],
  };
}

/**
 * Resolves a reading against one garment type.
 *
 * Separate from `readGarment` so that when the model was unsure and the user
 * picks the type themselves, the attributes and seasons are recomputed for
 * what they chose — without re-running the model.
 */
export function suggestionFor(
  analysis: ClothingAnalysis,
  entry: CategoryEntry,
): GarmentSuggestion {
  const attributes = attributesForCategory(analysis, entry);
  return {
    category: entry.category,
    subCategory: entry.sub_category,
    layeringRole: entry.layering_role,
    ...attributes,
    seasons: deriveSeasons({
      base: entry.seasons,
      category: entry.category,
      sleeveLength: attributes.sleeveLength,
      apparentWeight: attributes.apparentWeight,
      warmth: attributes.warmth,
      layeringRole: entry.layering_role,
    }),
  };
}
