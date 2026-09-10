/**
 * Supabase connection details, read with a useful failure message.
 *
 * These are `NEXT_PUBLIC_*` variables, which Next.js inlines into the bundle
 * at *build* time. A host that only sets them as runtime variables produces a
 * build where they are `undefined`, and the app then throws
 * `Cannot read properties of undefined (reading 'trim')` on every request —
 * a 500 that says nothing about the real problem. These helpers turn that into
 * a message naming the variable and where to set it.
 *
 * The `process.env.NEXT_PUBLIC_*` lookups must be written out in full here:
 * Next.js substitutes the literal text at build time, so a dynamic lookup like
 * `process.env[name]` would never be replaced and would always be undefined.
 */

function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(
      `Missing ${name}. This is a build-time variable, so it must be set ` +
        `before the app is built, not only on the running server. ` +
        `Locally: add it to .env.local. On Cloudflare: Settings -> Builds -> ` +
        `build variables, then trigger a new build. Copy the value from ` +
        `Supabase -> Project Settings -> API.`,
    );
  }
  return trimmed;
}

export function supabaseUrl(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

export function supabaseAnonKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
