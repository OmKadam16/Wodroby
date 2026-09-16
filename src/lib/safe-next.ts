/**
 * Sanitises a `?next=` destination before it reaches `location.assign`.
 *
 * Anything that isn't a same-site absolute path falls back to the wardrobe.
 * The `//` case matters: `//evil.example` is a protocol-relative URL, so a
 * check for a leading slash alone would happily send someone off-site.
 */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/wardrobe";
  return raw;
}
