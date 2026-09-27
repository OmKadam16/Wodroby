"use client";

import { useState, type FormEvent } from "react";
import { Loader2, MapPin, Search, ShoppingBag, X } from "lucide-react";
import type { GeoResult } from "@/app/api/geocode/route";
import { findWardrobeGaps, hideBuyNext } from "@/app/wardrobe/actions";
import { fetchYear } from "@/lib/climate";
import type { GapReport, GapSuggestion } from "@/lib/gap-finder";
import { useTempUnit } from "@/components/temp-unit-toggle";
import { displayTemp } from "@/lib/temp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { occasionLabel } from "@/types/wardrobe";

type State =
  | { step: "idle" }
  | { step: "working"; message: string }
  | { step: "done"; report: GapReport }
  /** `askCity`: location failed, so offer a typed place instead. */
  | { step: "error"; message: string; askCity?: boolean };

type Place = { label: string; latitude: number; longitude: number };

/** A place typed in once is kept on this device, so a browser that never
 *  shares its location does not have to be told the city every time. */
const PLACE_KEY = "wordroby_place";

function savedPlace(): Place | null {
  try {
    const value = JSON.parse(localStorage.getItem(PLACE_KEY) ?? "null");
    if (
      value &&
      typeof value.label === "string" &&
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude)
    ) {
      return value as Place;
    }
  } catch {
    // Unreadable or blocked storage is the same as nothing saved.
  }
  return null;
}

function savePlace(place: Place) {
  try {
    localStorage.setItem(PLACE_KEY, JSON.stringify(place));
  } catch {
    // Not remembering it only means being asked again next time.
  }
}

class LocationError extends Error {}

/**
 * The browser reports three different failures, and each has a different
 * fix. One message for all of them ("Location is off") sent people looking
 * at a setting that was already on, when the Mac had simply not found a fix.
 */
function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new LocationError("This browser can't share your location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location is blocked for this site."
            : error.code === error.TIMEOUT
              ? "Finding your location took too long."
              : "Your device couldn't work out where you are.";
        reject(new LocationError(message));
      },
      { timeout: 10_000, maximumAge: 3_600_000 },
    );
  });
}

/**
 * "What to buy next". Runs on request, never on page load: it reads a year of
 * weather and runs the outfit engine a few hundred times, which is worth a
 * couple of seconds when asked for and not on every visit to the wardrobe.
 */
export function GapFinder() {
  const [state, setState] = useState<State>({ step: "idle" });
  const [closed, setClosed] = useState(false);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<GeoResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [unit] = useTempUnit();

  /*
   * Gone at once rather than after the round trip. If the save fails the
   * card simply returns on the next visit, which is a smaller cost than
   * making someone watch a spinner to say "not now".
   */
  function close() {
    setClosed(true);
    void hideBuyNext().catch(() => {});
  }

  /**
   * Location first, because it needs no typing. If the browser will not give
   * one, a place typed in earlier is used instead, and only failing both
   * asks for a city.
   */
  async function run(place?: Place) {
    try {
      let latitude: number;
      let longitude: number;
      if (place) {
        ({ latitude, longitude } = place);
      } else {
        setState({ step: "working", message: "Finding you…" });
        try {
          ({ latitude, longitude } = (await position()).coords);
        } catch (err) {
          const fallback = savedPlace();
          if (!fallback) throw err;
          ({ latitude, longitude } = fallback);
        }
      }
      setState({ step: "working", message: "Reading a year of your weather…" });
      const bins = await fetchYear(latitude, longitude);
      setState({ step: "working", message: "Trying pieces against your wardrobe…" });
      const result = await findWardrobeGaps(bins);
      if (!result.ok) throw new Error(result.error);
      setState({ step: "done", report: result.report });
    } catch (err) {
      setState({
        step: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
        askCity: err instanceof LocationError,
      });
    }
  }

  async function searchPlaces(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const payload = (await response.json()) as { results?: GeoResult[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Place search failed.");
      setPlaces(payload.results ?? []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Place search failed.");
    } finally {
      setSearching(false);
    }
  }

  function pickPlace(result: GeoResult) {
    const place: Place = {
      label: [result.name, result.region, result.country].filter(Boolean).join(", "),
      latitude: result.latitude,
      longitude: result.longitude,
    };
    savePlace(place);
    setPlaces(null);
    setQuery("");
    void run(place);
  }

  const range = (s: GapSuggestion) =>
    s.fromF === s.toF
      ? `around ${displayTemp(s.fromF, unit)}°${unit}`
      : `${displayTemp(s.fromF, unit)}–${displayTemp(s.toF, unit)}°${unit}`;

  if (closed) return null;

  return (
    <section className="relative rounded-2xl border border-border bg-card p-4 sm:p-5">
      <button
        type="button"
        onClick={close}
        title="Hide for 3 days"
        className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
      >
        <X className="size-4" />
        <span className="sr-only">Hide What to buy next for 3 days</span>
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3 pr-9">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-sunken">
            <ShoppingBag className="size-4 text-clay-ink" />
          </span>
          <div>
            <p className="text-[15px] font-medium">What to buy next</p>
            <p className="text-[13px] text-muted-foreground">
              The piece that would add the most outfits, over a year of your weather.
            </p>
          </div>
        </div>
        {state.step !== "working" && (
          <Button variant="outline" size="sm" onClick={() => run()}>
            <MapPin />
            {state.step === "done" ? "Check again" : "Check my wardrobe"}
          </Button>
        )}
      </div>

      {state.step === "working" && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {state.message}
        </p>
      )}

      {state.step === "error" && (
        <div className="mt-4">
          <p className="text-sm font-medium">{state.message}</p>
          {state.askCity && (
            <>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Type your city instead. It&apos;s remembered on this device.
              </p>
              <form onSubmit={searchPlaces} className="mt-3 flex max-w-sm gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="City, e.g. Pune"
                  aria-label="City"
                  autoComplete="address-level2"
                />
                <Button type="submit" variant="outline" disabled={searching || query.trim().length < 2}>
                  {searching ? <Loader2 className="animate-spin" /> : <Search />}
                  <span className="sr-only sm:not-sr-only">Search</span>
                </Button>
              </form>
              {searchError && <p className="mt-2 text-[13px]">{searchError}</p>}
              {places && places.length === 0 && (
                <p className="mt-2 text-[13px] text-muted-foreground">No places by that name.</p>
              )}
              {places && places.length > 0 && (
                <ul className="mt-2 flex max-w-sm flex-col">
                  {places.map((p) => (
                    <li key={`${p.latitude},${p.longitude}`}>
                      <button
                        type="button"
                        onClick={() => pickPlace(p)}
                        className="w-full rounded-lg px-2 py-2 text-left text-[13px] hover:bg-accent"
                      >
                        {[p.name, p.region, p.country].filter(Boolean).join(", ")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {state.step === "done" &&
        (state.report.suggestions.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Nothing to add. Every day of your last year already has at least one Spot on
            look{state.report.occasions.length > 0 ? " for everything you dress for" : ""}.
          </p>
        ) : (
          <ol className="mt-4 flex flex-col divide-y divide-border">
            {state.report.suggestions.map((s, index) => (
              <li key={s.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span className="display w-5 shrink-0 text-lg leading-6 text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium">{s.label}</p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-[13px] text-muted-foreground">
                    {s.byOccasion.map(({ occasion, days }) => (
                      <li key={occasion ?? "any"}>
                        Spot on looks on {days} more {days === 1 ? "day" : "days"}
                        {occasion ? ` for ${occasionLabel(occasion).toLowerCase()}` : ""}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Mostly {range(s)}
                    {s.mostlyRain ? ", on rainy days" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ))}
    </section>
  );
}
