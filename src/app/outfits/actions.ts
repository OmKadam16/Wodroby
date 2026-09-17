"use server";

import { createClient } from "@/lib/supabase/server";
import {
  explainEmptyResult,
  generateOutfits,
  missingSlots,
  OUTFIT_PAGE_SIZE,
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
      /** Every look the wardrobe allows, not just the ones in this page. */
      total: number;
      /** Index this page starts at, echoed back so pages can't interleave. */
      offset: number;
      /** How many of the whole run came back with no compromises at all. */
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
  offset = 0,
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
      total: 0,
      offset: 0,
      exactCount: 0,
      notice: null,
      emptyReason: explainEmptyResult(
        (all ?? []) as WardrobeItem[],
        normalized,
      ),
    };
  }

  /*
   * Every look the wardrobe allows, in the order the engine chose.
   *
   * This used to merge with an outfit_cache row and cut the result to 24. The
   * cache bought nothing: the engine is deterministic, so regenerating from
   * the same wardrobe and request already returns the same looks in the same
   * order. What it did buy was a cap far below what a wardrobe can produce,
   * and a frozen JSON copy of every item that went stale the moment an item
   * was edited — which is how a cap ended up showing as a Bottom after it was
   * corrected to an accessory.
   *
   * The table stays for explicitly saved outfits, which are a different thing.
   */
  const start = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
  const page = fresh.slice(start, start + OUTFIT_PAGE_SIZE);

  // Counted over the whole run, not the page, so the notice below doesn't
  // appear on page three just because page three happens to be all compromises.
  const exactCount = fresh.filter((o) => o.matchLevel === "exact").length;

  return {
    ok: true,
    outfits: page,
    total: fresh.length,
    offset: start,
    exactCount,
    // The items already carry links signed moments ago, so there is nothing to
    // re-sign here; the notice only has to be built once, for the first page.
    notice:
      start === 0 && exactCount === 0 ? buildNotice(items, fresh, normalized) : null,
    emptyReason: null,
  };
}

/**
 * Records what became of a look.
 *
 * Nothing reads this yet, and that is deliberate. Colour harmony and weather
 * fit are closed-form problems and are now solved as such. Personal taste is
 * not: whether brown works with navy *for you* can only be learned from you,
 * and there is nothing to learn from until choices accumulate. This is where
 * they accumulate.
 *
 * Failures are swallowed on purpose. A missed row costs a data point; an error
 * shown to someone who just saved an outfit costs their confidence in the save.
 */
async function recordFeedback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  outfit: Outfit,
  req: OutfitRequest,
  action: "saved" | "dismissed",
): Promise<void> {
  try {
    await supabase.from("outfit_feedback").insert({
      user_id: userId,
      outfit_id: outfit.id,
      item_ids: outfit.items.map((i) => i.id),
      temp: Math.round(req.current_temp_f),
      occasion: req.occasion ?? null,
      is_rainy: Boolean(req.is_rainy),
      action,
    });
  } catch {
    // See above: this is bookkeeping, never the user's problem.
  }
}

/** Hides a look and records that it was not wanted. */
export async function dismissOutfit(
  outfit: Outfit,
  req: OutfitRequest,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  await recordFeedback(supabase, user.id, outfit, req, "dismissed");
  return { ok: true };
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
  // `item_ids` came off a row this client wrote, so the ids in it are only as
  // trustworthy as whatever posted them. Row-level security already refuses
  // another user's garment; scoping the query says so out loud rather than
  // leaving it to a policy two layers away.
  const { data: items } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", user.id)
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
  return { ok: true, outfits };
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
  await recordFeedback(supabase, user.id, outfit, req, "saved");
  return { ok: true, saved: true };
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
