import type { SupabaseClient } from "@supabase/supabase-js";
import type { WardrobeItem } from "@/types/wardrobe";

export const BUCKET = "wardrobe";

/** How long a display link stays valid. Pages are rendered per request, so a
 *  short life is free — the link is regenerated on every load. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** A wardrobe row plus a link the browser can actually load. */
export type WardrobeItemView = WardrobeItem & { display_url: string };

/**
 * `image_url` holds a bucket-relative path. Rows written before the bucket was
 * closed hold a full public URL instead, so the prefix is stripped when present.
 */
export function storagePath(imageUrl: string): string {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = imageUrl.indexOf(marker);
  if (index !== -1) return imageUrl.slice(index + marker.length);
  return imageUrl.replace(/^\/+/, "");
}

/**
 * Mints one short-lived signed link per item. The bucket is private, so this
 * is the only way a photo reaches the browser, and the storage RLS policy
 * still decides whether the caller is allowed to see it.
 */
export async function withSignedUrls<T extends WardrobeItem>(
  supabase: SupabaseClient,
  items: T[],
): Promise<(T & { display_url: string })[]> {
  if (items.length === 0) return [];

  const paths = items.map((item) => storagePath(item.image_url));
  const avifTransform = {
    width: 400,
    height: 400,
    resize: "cover" as const,
    quality: 45,
    format: "avif" as const,
  };
  const webpTransform = {
    width: 400,
    height: 400,
    resize: "cover" as const,
    quality: 55,
  };

  let data: Awaited<
    ReturnType<ReturnType<SupabaseClient["storage"]["from"]>["createSignedUrls"]>
  >["data"] = null;

  const avifAttempt = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS, {
      transform: avifTransform,
    } as unknown as { download: string });

  if (!avifAttempt.error && avifAttempt.data) {
    data = avifAttempt.data as unknown as typeof data;
  } else {
    const webpAttempt = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS, {
        transform: webpTransform,
      } as unknown as { download: string });

    if (!webpAttempt.error && webpAttempt.data) {
      data = webpAttempt.data as unknown as typeof data;
    } else {
      const fallback = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      if (fallback.error || !fallback.data) {
        return items.map((item) => ({ ...item, display_url: "" }));
      }
      data = fallback.data as unknown as typeof data;
    }
  }

  return items.map((item, index) => ({
    ...item,
    display_url: data![index]?.signedUrl ?? "",
  }));
}
