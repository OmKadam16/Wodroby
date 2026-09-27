/**
 * A year of the wearer's own weather, from Open-Meteo's historical archive.
 *
 * The last twelve months stand in for "a typical year". A true climate normal
 * would be steadier, but it would also be somewhere else's decade; last year
 * is the weather this wardrobe was actually worn through. Like the forecast,
 * it is keyless, CORS-open, and fetched from the browser so it spends the
 * visitor's own rate limit.
 *
 * Only the grouped counts leave the browser, never the coordinates: the
 * server needs to know "40 dry days near 50F", not where they happened.
 */

/** The wearer's year, grouped: this many days sat near this temperature. */
export type WeatherBin = { temp_f: number; rainy: boolean; days: number };

/** Width of a temperature band. Finer than a person dresses differently for
 *  would only multiply the engine runs. */
export const BIN_WIDTH_F = 5;

type ArchiveResponse = {
  daily?: {
    time?: string[];
    temperature_2m_mean?: (number | null)[];
    precipitation_sum?: (number | null)[];
  };
};

/** Millimetres in a day before it counts as a day you dress for rain. A
 *  passing shower overnight is not one. */
const RAINY_DAY_MM = 2;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildArchiveUrl(lat: number, lon: number, today = new Date()): URL {
  // The archive trails real time by a few days; ending a week back avoids
  // asking for days it does not have yet.
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() - 7);
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  start.setUTCDate(start.getUTCDate() + 1);

  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", lat.toFixed(2));
  url.searchParams.set("longitude", lon.toFixed(2));
  url.searchParams.set("start_date", isoDate(start));
  url.searchParams.set("end_date", isoDate(end));
  url.searchParams.set("daily", "temperature_2m_mean,precipitation_sum");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("timezone", "auto");
  return url;
}

/** Groups daily readings into BIN_WIDTH_F bands, split dry and rainy. */
export function binYear(json: unknown): WeatherBin[] {
  const daily = (json as ArchiveResponse).daily;
  const temps = daily?.temperature_2m_mean ?? [];
  const rain = daily?.precipitation_sum ?? [];

  const counts = new Map<string, WeatherBin>();
  for (let i = 0; i < temps.length; i++) {
    const t = temps[i];
    if (typeof t !== "number") continue;
    // Rounded to the centre of its band, which is the temperature the engine
    // is asked about for every day in it.
    const temp_f = Math.round(t / BIN_WIDTH_F) * BIN_WIDTH_F;
    const rainy = (rain[i] ?? 0) >= RAINY_DAY_MM;
    const k = `${temp_f}|${rainy}`;
    const bin = counts.get(k) ?? { temp_f, rainy, days: 0 };
    bin.days++;
    counts.set(k, bin);
  }
  return [...counts.values()].sort((a, b) => a.temp_f - b.temp_f);
}

export async function fetchYear(lat: number, lon: number): Promise<WeatherBin[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(buildArchiveUrl(lat, lon), {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Weather history returned ${response.status}.`);
    const bins = binYear(await response.json());
    if (bins.length === 0) throw new Error("No weather history for this place.");
    return bins;
  } finally {
    clearTimeout(timeout);
  }
}
