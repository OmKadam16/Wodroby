export type WeatherCondition =
  | "sunny"
  | "cloudy"
  | "rainy"
  | "snowy"
  | "windy"
  | "stormy";

export type Weather = {
  temp_f: number;
  feels_like_f: number;
  condition: WeatherCondition;
  description: string;
  is_rainy: boolean;
  wind_mph: number;
};

/** WMO weather interpretation codes used by Open-Meteo. */
function interpretCode(code: number): {
  condition: WeatherCondition;
  description: string;
} {
  if (code === 0) return { condition: "sunny", description: "Clear sky" };
  if (code <= 2) return { condition: "sunny", description: "Mostly clear" };
  if (code === 3) return { condition: "cloudy", description: "Overcast" };
  if (code === 45 || code === 48)
    return { condition: "cloudy", description: "Fog" };
  if (code >= 51 && code <= 57)
    return { condition: "rainy", description: "Drizzle" };
  if (code >= 61 && code <= 67)
    return { condition: "rainy", description: "Rain" };
  if (code >= 71 && code <= 77)
    return { condition: "snowy", description: "Snow" };
  if (code >= 80 && code <= 82)
    return { condition: "rainy", description: "Rain showers" };
  if (code === 85 || code === 86)
    return { condition: "snowy", description: "Snow showers" };
  if (code >= 95) return { condition: "stormy", description: "Thunderstorm" };
  return { condition: "cloudy", description: "Cloudy" };
}

/** Maps a MET Norway symbol_code (e.g. "lightrainshowers_day") to our condition. */
function interpretSymbol(symbol: string): {
  condition: WeatherCondition;
  description: string;
} {
  const base = symbol.replace(/_(day|night|polartwilight)$/, "");
  if (base === "clearsky" || base === "fair")
    return { condition: "sunny", description: "Clear sky" };
  if (base === "partlycloudy")
    return { condition: "cloudy", description: "Partly cloudy" };
  if (base === "cloudy" || base === "fog")
    return { condition: "cloudy", description: base === "fog" ? "Fog" : "Overcast" };
  if (base.includes("thunder"))
    return { condition: "stormy", description: "Thunderstorm" };
  if (
    base.includes("snow") ||
    base.includes("sleet") ||
    base === "lightsnowandthunder"
  )
    return { condition: "snowy", description: "Snow" };
  if (
    base.includes("rain") ||
    base.includes("drizzle") ||
    base.includes("shower")
  )
    return { condition: "rainy", description: "Rain" };
  return { condition: "cloudy", description: "Cloudy" };
}

type MetNoResponse = {
  properties?: {
    timeseries?: {
      data?: {
        instant?: {
          details?: {
            air_temperature?: number;
            wind_speed?: number;
          };
        };
        next_1_hours?: {
          summary?: { symbol_code?: string };
          details?: { precipitation_amount?: number };
        };
        next_6_hours?: {
          summary?: { symbol_code?: string };
          details?: { precipitation_amount?: number };
        };
        next_12_hours?: {
          summary?: { symbol_code?: string };
        };
      };
    }[];
  };
};

/** Pure mapping — exported for testing against a saved provider response. */
export function metNoToWeather(json: MetNoResponse): Weather {
  const point = json.properties?.timeseries?.[0]?.data;
  const tempC = point?.instant?.details?.air_temperature;
  if (typeof tempC !== "number") {
    throw new Error("Backup weather returned no current conditions.");
  }
  const symbol =
    point?.next_1_hours?.summary?.symbol_code ??
    point?.next_6_hours?.summary?.symbol_code ??
    point?.next_12_hours?.summary?.symbol_code ??
    "cloudy";
  const { condition, description } = interpretSymbol(symbol);
  const windMs = point?.instant?.details?.wind_speed ?? 0;
  const precip =
    point?.next_1_hours?.details?.precipitation_amount ??
    point?.next_6_hours?.details?.precipitation_amount ??
    0;

  const tempF = Math.round((tempC * 9) / 5 + 32);
  const windMph = Math.round(windMs * 2.237);

  return {
    temp_f: tempF,
    feels_like_f: tempF,
    condition: windMph >= 20 && condition === "cloudy" ? "windy" : condition,
    description,
    is_rainy:
      condition === "rainy" || condition === "stormy" || precip > 0,
    wind_mph: windMph,
  };
}

/** MET Norway needs no key but requires an identifying User-Agent. */
async function fetchWeatherMetNo(lat: number, lon: number): Promise<Weather> {
  const url = new URL(
    "https://api.met.no/weatherapi/locationforecast/2.0/compact",
  );
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 600 },
      headers: {
        "User-Agent": "Wardroby/1.0 https://github.com/OmKadam16/Wodroby",
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Backup weather timed out.");
    }
    throw new Error("Could not reach the backup weather service.");
  }
  clearTimeout(timeout);
  if (!response.ok) {
    throw new Error(`Backup weather error (${response.status}).`);
  }
  return metNoToWeather((await response.json()) as MetNoResponse);
}

/**
 * Open-Meteo needs no API key. Values are requested directly in °F / mph so no
 * conversion happens on our side.
 *
 * Render's shared egress IPs get rate-limited by Open-Meteo (429), which took
 * weather down in production while dev worked fine — so a MET Norway fallback
 * (separate infrastructure, also keyless) keeps the feature alive.
 */
async function fetchWeatherOpenMeteo(
  lat: number,
  lon: number,
): Promise<Weather> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation",
  );
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");

  // Retry on 429/5xx with backoff; Open-Meteo rate-limits shared IPs.
  // `next.revalidate` keeps repeat views (dev + phone on one IP) off origin.
  let response: Response | null = null;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      response = await fetch(url, {
        signal: controller.signal,
        next: { revalidate: 600 },
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Weather request timed out. Try again.");
      }
      throw new Error("Could not reach the weather service. Try again.");
    }
    clearTimeout(timeout);
    lastStatus = response.status;
    if (response.ok) break;
    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    break;
  }
  if (!response || !response.ok) {
    if (lastStatus === 429) {
      throw new Error("__RATE_LIMITED__");
    }
    throw new Error(
      `Weather service error (${lastStatus}). Try again in a moment.`,
    );
  }

  const data = (await response.json()) as {
    current?: {
      temperature_2m?: number;
      apparent_temperature?: number;
      weather_code?: number;
      wind_speed_10m?: number;
      precipitation?: number;
    };
  };

  const current = data.current;
  if (!current || typeof current.temperature_2m !== "number") {
    throw new Error("Open-Meteo returned no current conditions.");
  }

  const code = current.weather_code ?? 3;
  const { condition, description } = interpretCode(code);
  const wind = current.wind_speed_10m ?? 0;

  return {
    temp_f: Math.round(current.temperature_2m),
    feels_like_f: Math.round(
      current.apparent_temperature ?? current.temperature_2m,
    ),
    condition: wind >= 20 && condition === "cloudy" ? "windy" : condition,
    description,
    is_rainy:
      condition === "rainy" ||
      condition === "stormy" ||
      (current.precipitation ?? 0) > 0,
    wind_mph: Math.round(wind),
  };
}

/**
 * Primary (Open-Meteo) with automatic failover to MET Norway. Any primary
 * failure — 429, 5xx, timeout, network, bad payload — tries the backup
 * before surfacing an error, so one provider's outage never kills weather.
 */
export async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  let primaryError: unknown = null;
  try {
    return await fetchWeatherOpenMeteo(lat, lon);
  } catch (err) {
    primaryError = err;
  }
  try {
    return await fetchWeatherMetNo(lat, lon);
  } catch {
    if (
      primaryError instanceof Error &&
      primaryError.message !== "__RATE_LIMITED__"
    ) {
      throw primaryError;
    }
    throw new Error(
      "Too many weather requests right now. Wait a minute — your temp stays editable below.",
    );
  }
}
