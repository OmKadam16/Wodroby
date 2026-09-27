import { NextResponse } from "next/server";
import { fetchWeather } from "@/lib/weather";
import { guardApiRoute } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/weather?lat=..&lon=.. — proxies Open-Meteo (no API key needed). */
export async function GET(request: Request) {
  // Only the fallback when the browser can't reach Open-Meteo itself, so a
  // real visitor needs this once per page load at most.
  const refused = await guardApiRoute("weather", 10);
  if (refused) return refused;

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "lat and lon query parameters are required." },
      { status: 400 },
    );
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json(
      { error: "lat must be -90..90 and lon -180..180." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ weather: await fetchWeather(lat, lon) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Weather lookup failed.";
    const status = /timed out/i.test(message) ? 504 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
