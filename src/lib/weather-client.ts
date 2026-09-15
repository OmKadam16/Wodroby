"use client";

import {
  buildOpenMeteoUrl,
  openMeteoToWeather,
  type Weather,
} from "@/lib/weather";

/**
 * Ask Open-Meteo straight from the browser.
 *
 * The server route shares one egress IP for every visitor, and on a free host
 * that IP is shared with other tenants too — Open-Meteo rate-limits it (429),
 * so production was quietly falling through to the MET Norway backup on every
 * request, after ~2.4s of retry backoff. Calling from the browser spends the
 * visitor's own IP instead, which is the quota Open-Meteo actually intends.
 *
 * Open-Meteo sends permissive CORS headers and needs no key, so no secret is
 * exposed by moving this to the client.
 */
export async function fetchWeatherDirect(
  lat: number,
  lon: number,
): Promise<Weather> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(buildOpenMeteoUrl(lat, lon), {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo returned ${response.status}.`);
    }
    return openMeteoToWeather(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}
