"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { conditionsFor, seasonsToTempRange } from "@/lib/seasons";
import { BUCKET, signOriginals, storagePath } from "@/lib/storage";
import type { WardrobeItem } from "@/types/wardrobe";
import {
  APPARENT_WEIGHTS,
  CATEGORIES,
  FORMALITIES,
  isSeason,
  LAYERING_ROLES,
  SLEEVE_LENGTHS,
  WARMTH_LEVELS,
  type ApparentWeight,
  type Category,
  type Formality,
  type LayeringRole,
  type Season,
  type SleeveLength,
  type WarmthLevel,
} from "@/types/wardrobe";

export type SaveItemInput = {
  image_url: string;
  item_name: string;
  category: Category;
  sub_category: string;
  primary_color: string;
  secondary_colors: string[];
  formality: Formality;
  seasons: Season[];
  rain_ready: boolean;
  sleeve_length: SleeveLength | null;
  apparent_weight: ApparentWeight | null;
  warmth: WarmthLevel | null;
  /** Measured colour, or null when the reader failed or the user chose by hand. */
  color_l: number | null;
  color_c: number | null;
  color_h: number | null;
  occasions: string[];
  wear_notes: string;
  layering_role: LayeringRole;
};

/** `null` means "we could not tell", which is a valid stored value. Anything
 *  outside the list is a bug in the caller, not a shrug — so it errors. */
function optionalAttribute<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | null | undefined {
  if (value === null) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveItem(input: SaveItemInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "You must be signed in." };

  if (!input.image_url) return { ok: false, error: "Image is missing." };
  if (!input.item_name.trim()) return { ok: false, error: "Name is required." };
  if (!CATEGORIES.includes(input.category))
    return { ok: false, error: "Invalid category." };
  if (!FORMALITIES.includes(input.formality))
    return { ok: false, error: "Invalid formality." };
  if (!LAYERING_ROLES.includes(input.layering_role))
    return { ok: false, error: "Invalid layering role." };

  // Deduped here rather than in the database: `seasons <@ array[...]` accepts
  // {summer,summer}, and catching that in a CHECK would need a subquery, which
  // CHECK constraints forbid.
  const seasons = [...new Set(input.seasons)].filter(isSeason);
  if (seasons.length === 0) return { ok: false, error: "Pick at least one season." };

  const sleeveLength = optionalAttribute(input.sleeve_length, SLEEVE_LENGTHS);
  const apparentWeight = optionalAttribute(input.apparent_weight, APPARENT_WEIGHTS);
  const warmth = optionalAttribute(input.warmth, WARMTH_LEVELS);
  if (sleeveLength === undefined || apparentWeight === undefined || warmth === undefined) {
    return { ok: false, error: "Invalid garment attribute." };
  }

  /*
   * The measured colour. All three coordinates travel together or not at all:
   * a half-written triple would read as a colour nobody chose, and `colorOf`
   * only trusts the numbers when every one of them is present.
   */
  const inRange = (v: number | null, lo: number, hi: number) =>
    v === null || (Number.isFinite(v) && v >= lo && v <= hi);
  if (
    !inRange(input.color_l, 0, 1) ||
    !inRange(input.color_c, 0, 0.5) ||
    !inRange(input.color_h, 0, 360)
  ) {
    return { ok: false, error: "Invalid colour measurement." };
  }
  const complete =
    input.color_l !== null && input.color_c !== null && input.color_h !== null;
  const colorL = complete ? input.color_l : null;
  const colorC = complete ? input.color_c : null;
  const colorH = complete ? input.color_h : null;

  const rainReady = Boolean(input.rain_ready);
  // Derived, never sent by the client. This is the single point that keeps
  // seasons and the temperature range from drifting apart again.
  const { min, max } = seasonsToTempRange(seasons);

  const { error } = await supabase.from("wardrobe_items").insert({
    user_id: user.id,
    image_url: input.image_url,
    item_name: input.item_name.trim(),
    category: input.category,
    sub_category: input.sub_category.trim() || input.category,
    primary_color: input.primary_color.trim().toLowerCase() || "unknown",
    secondary_colors: input.secondary_colors,
    formality: input.formality,
    seasons,
    rain_ready: rainReady,
    sleeve_length: sleeveLength,
    apparent_weight: apparentWeight,
    warmth,
    color_l: colorL,
    color_c: colorC,
    color_h: colorH,
    min_temp_f: min,
    max_temp_f: max,
    // Kept coherent as a derived mirror so the legacy readers of this column
    // — suitsRain's fallback, cached outfit snapshots — keep working.
    suitable_conditions: conditionsFor(seasons, rainReady),
    occasions: input.occasions,
    wear_notes: input.wear_notes.trim() || null,
    layering_role: input.layering_role,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/wardrobe");
  revalidatePath("/outfits");
  return { ok: true };
}

/**
 * Removes a garment: the photo first, then the row.
 *
 * Deleting only the row left the photograph in the bucket forever. Nobody
 * else could read it — storage policies scope every object to the folder
 * named after its owner — but "delete" has one meaning to the person clicking
 * it, and a picture of their clothes outliving the item they deleted is not
 * it.
 *
 * The photo goes first on purpose. If storage refuses, the row survives and
 * the item is still listed, so the delete can be retried; the other order
 * would report success and quietly leave the file behind, which is the bug
 * being fixed. `original_image_url` is included because the uncompressed
 * upload is a second object whenever one was kept.
 */
export async function deleteItem(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: item, error: readError } = await supabase
    .from("wardrobe_items")
    .select("image_url, original_image_url")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };
  // Already gone. Nothing to undo and nothing to report.
  if (!item) return { ok: true };

  const paths = [...new Set(
    [item.image_url, item.original_image_url]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .map(storagePath),
  )];

  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove(paths);
    if (storageError) {
      return {
        ok: false,
        error: `Could not delete the photo, so the item was kept: ${storageError.message}`,
      };
    }
  }

  const { error } = await supabase
    .from("wardrobe_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/wardrobe");
  revalidatePath("/outfits");
  return { ok: true };
}

/* ------------------------------------------------------------------------- */
/* Re-analysis                                                               */
/*                                                                           */
/* Items added before the reader existed, or before it learned to keep the   */
/* colour coordinates, carry less than the engine can now use. Rather than    */
/* ask anyone to delete and re-add a wardrobe, the same pipeline that runs on */
/* an upload is run again over what is already stored.                        */
/*                                                                           */
/* It runs in the browser, exactly like the original analysis: the photo is   */
/* fetched from the wearer's own storage, read on their device, and only the  */
/* resulting words and numbers come back here. No image is sent anywhere, and */
/* the stored file is never rewritten.                                        */
/* ------------------------------------------------------------------------- */

export type ReanalysisTarget = {
  id: string;
  item_name: string;
  category: Category;
  sub_category: string;
  primary_color: string;
  seasons: string[];
  sleeve_length: SleeveLength | null;
  apparent_weight: ApparentWeight | null;
  warmth: WarmthLevel | null;
  has_measured_color: boolean;
  /** Short-lived link to the original, uncropped photo. */
  source_url: string;
};

export async function getItemsForReanalysis(): Promise<
  { ok: true; items: ReanalysisTarget[] } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };

  const signed = await signOriginals(supabase, (data ?? []) as WardrobeItem[]);
  return {
    ok: true,
    items: signed.map((item) => ({
      id: item.id,
      item_name: item.item_name,
      category: item.category,
      sub_category: item.sub_category,
      primary_color: item.primary_color,
      seasons: item.seasons ?? [],
      sleeve_length: item.sleeve_length,
      apparent_weight: item.apparent_weight,
      warmth: item.warmth,
      has_measured_color: item.color_l !== null,
      source_url: item.source_url,
    })),
  };
}

export type AnalysisPatch = {
  primary_color: string;
  secondary_colors: string[];
  color_l: number | null;
  color_c: number | null;
  color_h: number | null;
  sleeve_length: SleeveLength | null;
  apparent_weight: ApparentWeight | null;
  warmth: WarmthLevel | null;
  seasons: Season[];
};

/**
 * Writes one item's re-read.
 *
 * Deliberately not touching `category`, `sub_category` or `item_name`. Those
 * are the fields someone is most likely to have corrected by hand, and a
 * second opinion from the same model that got them wrong the first time is no
 * reason to overwrite a human. Disagreements are reported instead.
 */
export async function applyAnalysis(
  id: string,
  patch: AnalysisPatch,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const sleeveLength = optionalAttribute(patch.sleeve_length, SLEEVE_LENGTHS);
  const apparentWeight = optionalAttribute(patch.apparent_weight, APPARENT_WEIGHTS);
  const warmth = optionalAttribute(patch.warmth, WARMTH_LEVELS);
  if (sleeveLength === undefined || apparentWeight === undefined || warmth === undefined) {
    return { ok: false, error: "Invalid garment attribute." };
  }

  const seasons = [...new Set(patch.seasons)].filter(isSeason);
  if (seasons.length === 0) return { ok: false, error: "Derived no season." };

  const complete =
    patch.color_l !== null && patch.color_c !== null && patch.color_h !== null;
  const { min, max } = seasonsToTempRange(seasons);
  const rainReady = false;

  const { error } = await supabase
    .from("wardrobe_items")
    .update({
      primary_color: patch.primary_color.trim().toLowerCase() || "unknown",
      secondary_colors: patch.secondary_colors,
      color_l: complete ? patch.color_l : null,
      color_c: complete ? patch.color_c : null,
      color_h: complete ? patch.color_h : null,
      sleeve_length: sleeveLength,
      apparent_weight: apparentWeight,
      warmth,
      seasons,
      min_temp_f: min,
      max_temp_f: max,
      suitable_conditions: conditionsFor(seasons, rainReady),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/wardrobe");
  revalidatePath("/outfits");
  return { ok: true };
}
