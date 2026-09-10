import { NextResponse } from "next/server";
import { fetchWeather } from "@/lib/weather";

/** GET /api/weather?lat=..&lon=.. — proxies Open-Meteo (no API key needed). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "lat and lon query parameters are required." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ weather: await fetchWeather(lat, lon) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Weather lookup failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
