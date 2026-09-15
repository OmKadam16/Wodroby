import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — a deliberately trivial endpoint for uptime pings.
 *
 * Render's free tier spins the service down after ~15 minutes with no
 * traffic, and the next visitor then waits through a cold start. An external
 * pinger hitting this every 10 minutes keeps the instance warm.
 *
 * It exists so those pings stay cheap: it touches no database and is excluded
 * from the proxy in src/proxy.ts, so it never runs a Supabase session refresh.
 * Pinging a real page instead would do that work every 10 minutes, forever.
 */
export function GET() {
  return NextResponse.json(
    { ok: true, time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
