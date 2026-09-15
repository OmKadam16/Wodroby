import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type GeoResult = {
  name: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
};

/** GET /api/geocode?q=mumbai — city search without exposing the browser to CORS/CSP issues. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: "Type at least 2 letters to search." },
      { status: 400 },
    );
  }

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", q);
  url.searchParams.set("count", "6");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Place search failed (${response.status}). Try again.` },
        { status: 502 },
      );
    }
    const data = (await response.json()) as {
      results?: {
        name?: string;
        admin1?: string;
        country?: string;
        latitude?: number;
        longitude?: number;
      }[];
    };
    const results: GeoResult[] = (data.results ?? [])
      .filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number")
      .map((r) => ({
        name: r.name ?? q,
        region: r.admin1 ?? "",
        country: r.country ?? "",
        latitude: r.latitude as number,
        longitude: r.longitude as number,
      }));
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json(
        { error: "Place search timed out. Try again." },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: "Could not search places. Try again." },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
