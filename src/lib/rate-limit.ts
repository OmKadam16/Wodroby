import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * A fixed-window counter held in this process's memory.
 *
 * Deliberately small. The app runs as one Node process on Render, so one Map
 * sees every request; a restart clears it, which only ever errs towards
 * letting someone through. If the service is ever scaled past one instance,
 * each instance counts on its own and the effective limit multiplies — move
 * this to a shared store (Postgres, Upstash) at that point.
 */
type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

/** Past this many live keys, expired ones are swept before adding another. */
const SWEEP_AT = 10_000;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();

  if (windows.size >= SWEEP_AT) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }

  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (current.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  }
  current.count += 1;
  return { ok: true };
}

/**
 * The gate in front of the server-side proxies to Open-Meteo.
 *
 * They were open to the internet: anyone could loop on them and spend this
 * server's shared outbound IP, and once Open-Meteo rate-limits that IP, place
 * search and the weather fallback stop working for everyone. Both are only
 * called from signed-in pages, so they now require a session, and each
 * account gets its own budget.
 *
 * Returns a response to send back when the request is refused, or null to
 * carry on.
 */
export async function guardApiRoute(
  name: string,
  limit: number,
  windowMs = 60_000,
): Promise<NextResponse | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to use this." }, { status: 401 });
  }

  const verdict = rateLimit(`${name}:${user.id}`, limit, windowMs);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many requests. Wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
    );
  }
  return null;
}
