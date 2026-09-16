"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  CATEGORIES,
  FORMALITIES,
  LAYERING_ROLES,
  type Category,
  type Formality,
  type LayeringRole,
} from "@/types/wardrobe";

export type SaveItemInput = {
  image_url: string;
  item_name: string;
  category: Category;
  sub_category: string;
  primary_color: string;
  secondary_colors: string[];
  formality: Formality;
  min_temp_f: number;
  max_temp_f: number;
  suitable_conditions: string[];
  occasions: string[];
  wear_notes: string;
  layering_role: LayeringRole;
};

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

  const min = Math.round(input.min_temp_f);
  const max = Math.round(input.max_temp_f);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    return { ok: false, error: "Temperature range is invalid." };
  }

  const { error } = await supabase.from("wardrobe_items").insert({
    user_id: user.id,
    image_url: input.image_url,
    item_name: input.item_name.trim(),
    category: input.category,
    sub_category: input.sub_category.trim() || input.category,
    primary_color: input.primary_color.trim().toLowerCase() || "unknown",
    secondary_colors: input.secondary_colors,
    formality: input.formality,
    min_temp_f: min,
    max_temp_f: max,
    suitable_conditions: input.suitable_conditions,
    occasions: input.occasions,
    wear_notes: input.wear_notes.trim() || null,
    layering_role: input.layering_role,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/wardrobe");
  revalidatePath("/outfits");
  return { ok: true };
}

export async function deleteItem(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "You must be signed in." };

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
