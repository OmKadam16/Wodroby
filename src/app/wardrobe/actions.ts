"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { conditionsFor, seasonsToTempRange } from "@/lib/seasons";
import { BUCKET, storagePath } from "@/lib/storage";
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
