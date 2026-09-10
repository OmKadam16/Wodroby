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

/**
 * Open-Meteo needs no API key. Values are requested directly in °F / mph so no
 * conversion happens on our side.
 */
export async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation",
  );
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");

  const response = await fetch(url, { next: { revalidate: 600 } });
  if (!response.ok) {
    throw new Error(`Open-Meteo responded with ${response.status}`);
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
