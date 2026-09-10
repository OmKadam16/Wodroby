"use server";

import { createClient } from "@/lib/supabase/server";
import {
  explainEmptyResult,
  generateOutfits,
  missingSlots,
  type Outfit,
  type OutfitRequest,
} from "@/lib/outfit-engine";
import { withSignedUrls, type WardrobeItemView } from "@/lib/storage";
import {
  OCCASIONS,
  occasionLabel,
  type Occasion,
  type WardrobeItem,
} from "@/types/wardrobe";

export type GenerateResult =
  | {
      ok: true;
      outfits: Outfit[];
      /** How many came back with no compromises at all. */
      exactCount: number;
      /** Set when the results fall short of what was asked for. */
      notice: string | null;
      /** Set when no outfit could be assembled at all. */
      emptyReason: string | null;
    }
  | { ok: false; error: string };

/**
 * Deterministic pipeline: a SQL query for pieces near today's temperature,
 * then plain array assembly and scoring in `generateOutfits`. No LLM.
 */
export async function generateOutfitsAction(
  req: OutfitRequest,
): Promise<GenerateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "You must be signed in." };

  const temp = Math.round(req.current_temp_f);
  if (!Number.isFinite(temp)) {
    return { ok: false, error: "Temperature is invalid." };
  }

  const occasion =
    req.occasion && OCCASIONS.includes(req.occasion)
      ? (req.occasion as Occasion)
      : null;

  const normalized: OutfitRequest = {
    current_temp_f: temp,
    occasion,
    is_rainy: Boolean(req.is_rainy),
  };

  // Widen to max category tolerance (accessories 40) so flexible pieces like jeans/skirts aren't cut by SQL — engine does per-category filtering.
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", user.id)
    .lte("min_temp_f", temp + 40)
    .gte("max_temp_f", temp - 40);

  if (error) return { ok: false, error: error.message };

  const items = await withSignedUrls(supabase, (data ?? []) as WardrobeItem[]);
  const fresh = generateOutfits(items, normalized);

  if (fresh.length === 0) {
    const { data: all } = await supabase
      .from("wardrobe_items")
      .select("*")
      .eq("user_id", user.id);

    return {
      ok: true,
      outfits: [],
      exactCount: 0,
      notice: null,
      emptyReason: explainEmptyResult(
        (all ?? []) as WardrobeItem[],
        normalized,
      ),
    };
  }

  const validIds = new Set(items.map((i) => i.id));
  const occasionKey = normalized.occasion ?? "";

  let cachedOutfits: Outfit[] = [];
  const { data: cachedRow } = await supabase
    .from("outfit_cache")
    .select("outfits")
    .eq("user_id", user.id)
    .eq("temp", temp)
    .eq("occasion", occasionKey)
    .eq("is_rainy", normalized.is_rainy)
    .maybeSingle();

  if (cachedRow?.outfits && Array.isArray(cachedRow.outfits)) {
    cachedOutfits = (cachedRow.outfits as Outfit[]).filter((o) =>
      o.items.every((it) => validIds.has(it.id)),
    );
  }

  const cachedIds = new Set(cachedOutfits.map((o) => o.id));
  const additions = fresh.filter((o) => !cachedIds.has(o.id));

  let outfits: Outfit[];
  if (cachedOutfits.length > 0) {
    outfits = [...cachedOutfits, ...additions];
    if (additions.length > 0) {
      const merged = outfits.slice(0, 24);
      await supabase.from("outfit_cache").upsert(
        {
          user_id: user.id,
          temp,
          occasion: occasionKey,
          is_rainy: normalized.is_rainy,
          outfits: merged,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,temp,occasion,is_rainy" },
      );
      outfits = merged;
    }
  } else {
    outfits = fresh.slice(0, 24);
    await supabase.from("outfit_cache").upsert(
      {
        user_id: user.id,
        temp,
        occasion: occasionKey,
        is_rainy: normalized.is_rainy,
        outfits,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,temp,occasion,is_rainy" },
    );
  }

  const hydrated = await hydrateOutfitItemUrls(supabase, outfits);
  const exactCount = hydrated.filter((o) => o.matchLevel === "exact").length;

  return {
    ok: true,
    outfits: hydrated,
    exactCount,
    notice: exactCount > 0 ? null : buildNotice(items, hydrated, normalized),
    emptyReason: null,
  };
}

async function hydrateOutfitItemUrls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  outfits: Outfit[],
): Promise<Outfit[]> {
  const allItemIds = [...new Set(outfits.flatMap((o) => o.items.map((i) => i.id)))];
  if (allItemIds.length === 0) return outfits;
  const { data } = await supabase
    .from("wardrobe_items")
    .select("*")
    .in("id", allItemIds);
  if (!data) return outfits;
  const signed = await withSignedUrls(supabase, data as WardrobeItem[]);
  const urlById = new Map(signed.map((s) => [s.id, s.display_url]));
  return outfits.map((o) => ({
    ...o,
    items: o.items.map((it) => ({
      ...it,
      display_url: urlById.get(it.id) ?? it.display_url,
    })),
  }));
}

export async function getSavedOutfits(): Promise<{
  ok: true;
  outfits: Outfit[];
} | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  const { data, error } = await supabase
    .from("saved_outfits")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: true, outfits: [] };
  const itemIds = [...new Set(data.flatMap((r) => r.item_ids))];
  const { data: items } = await supabase
    .from("wardrobe_items")
    .select("*")
    .in("id", itemIds);
  const signed = items ? await withSignedUrls(supabase, items as WardrobeItem[]) : [];
  const itemById = new Map(signed.map((s) => [s.id, s]));
  const outfits: Outfit[] = data
    .map((row) => {
      const outfitItems = (row.item_ids as string[])
        .map((id) => itemById.get(id))
        .filter(Boolean) as WardrobeItemView[];
      if (outfitItems.length !== (row.item_ids as string[]).length) return null;
      return {
        id: row.outfit_id as string,
        items: outfitItems,
        score: Number(row.score ?? 0),
        matchLevel: (row.match_level as Outfit["matchLevel"]) ?? "alternative",
        reasons: (row.reasons as string[]) ?? [],
        compromises: (row.compromises as string[]) ?? [],
      } as Outfit;
    })
    .filter(Boolean) as Outfit[];
  const hydrated = await hydrateOutfitItemUrls(supabase, outfits);
  return { ok: true, outfits: hydrated };
}

export async function toggleSaveOutfit(outfit: Outfit, req: OutfitRequest): Promise<{ ok: true; saved: boolean } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  const { data: existing } = await supabase
    .from("saved_outfits")
    .select("id")
    .eq("user_id", user.id)
    .eq("outfit_id", outfit.id)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("saved_outfits")
      .delete()
      .eq("user_id", user.id)
      .eq("outfit_id", outfit.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, saved: false };
  }
  const { error } = await supabase.from("saved_outfits").insert({
    user_id: user.id,
    outfit_id: outfit.id,
    item_ids: outfit.items.map((i) => i.id),
    temp: Math.round(req.current_temp_f),
    occasion: req.occasion ?? "",
    is_rainy: Boolean(req.is_rainy),
    score: outfit.score,
    match_level: outfit.matchLevel,
    reasons: outfit.reasons,
    compromises: outfit.compromises,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, saved: true };
}

export async function getCachedOutfits(req: OutfitRequest): Promise<Outfit[] | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("outfit_cache")
    .select("outfits")
    .eq("user_id", user.id)
    .eq("temp", Math.round(req.current_temp_f))
    .eq("occasion", req.occasion ?? "")
    .eq("is_rainy", Boolean(req.is_rainy))
    .maybeSingle();
  if (!data?.outfits || !Array.isArray(data.outfits)) return null;
  const outfits = data.outfits as Outfit[];
  const hydrated = await hydrateOutfitItemUrls(supabase, outfits);
  return hydrated;
}

/** Explains, in one sentence, why nothing is a clean match. */
function buildNotice(
  items: WardrobeItemView[],
  outfits: Outfit[],
  req: OutfitRequest,
): string {
  const label = req.occasion ? occasionLabel(req.occasion).toLowerCase() : null;

  if (label) {
    const tagged = items.filter((i) => i.occasions.includes(req.occasion!));
    if (tagged.length === 0) {
      return `Nothing in your wardrobe is tagged for ${label}. These are the closest fit in style and temperature — they'll work, they just weren't made for it.`;
    }
    const missing = missingSlots(tagged, req.current_temp_f);
    if (missing.length > 0) {
      return `You have pieces tagged for ${label}, but not a full outfit — you're missing ${missing.join(" and ")}. These fill the gap from the rest of your wardrobe.`;
    }
  }

  const needsLayer = outfits.every(
    (o) => !o.items.some((i) => i.category === "outerwear"),
  );
  if (req.current_temp_f < 60 && needsLayer) {
    return `No outerwear in your wardrobe fits ${req.current_temp_f}°F. These work otherwise — throw a jacket over the top.`;
  }

  return "Nothing matches perfectly today, so these are the closest your wardrobe gets.";
}
