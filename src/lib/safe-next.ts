const FALLBACK = "/wardrobe";

/** Any origin that cannot be ours; only used to see where a path resolves. */
const PROBE_ORIGIN = "https://wardroby.invalid";

/**
 * Sanitises a `?next=` destination before it reaches `location.assign`.
 *
 * Anything that isn't a same-site absolute path falls back to the wardrobe.
 * A leading-slash check alone is not enough: `//evil.example` is a
 * protocol-relative URL, and browsers also read `\` as `/` and silently drop
 * tabs and newlines while parsing, so `/\evil.example` and `/<tab>/evil.example`
 * both land on evil.example too. The value is therefore resolved the way the
 * browser will resolve it, and kept only if it is still on this site.
 */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return FALLBACK;
  // No legitimate in-app path contains a backslash or a control character.
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return FALLBACK;

  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return FALLBACK;
  }
  if (url.origin !== PROBE_ORIGIN) return FALLBACK;
  return url.pathname + url.search + url.hash;
}
