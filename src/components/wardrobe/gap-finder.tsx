"use client";

import { useState } from "react";
import { Loader2, MapPin, ShoppingBag } from "lucide-react";
import { findWardrobeGaps } from "@/app/wardrobe/actions";
import { fetchYear } from "@/lib/climate";
import type { GapReport, GapSuggestion } from "@/lib/gap-finder";
import { useTempUnit } from "@/components/temp-unit-toggle";
import { displayTemp } from "@/lib/temp";
import { Button } from "@/components/ui/button";
import { occasionLabel } from "@/types/wardrobe";

type State =
  | { step: "idle" }
  | { step: "working"; message: string }
  | { step: "done"; report: GapReport }
  | { step: "error"; message: string };

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This browser cannot share your location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error("Location is off.")), {
      timeout: 10_000,
      maximumAge: 3_600_000,
    });
  });
}

/**
 * "What to buy next". Runs on request, never on page load: it reads a year of
 * weather and runs the outfit engine a few hundred times, which is worth a
 * couple of seconds when asked for and not on every visit to the wardrobe.
 */
export function GapFinder() {
  const [state, setState] = useState<State>({ step: "idle" });
  const [unit] = useTempUnit();

  async function run() {
    try {
      setState({ step: "working", message: "Finding you…" });
      const { latitude, longitude } = (await position()).coords;
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
      });
    }
  }

  const range = (s: GapSuggestion) =>
    s.fromF === s.toF
      ? `around ${displayTemp(s.fromF, unit)}°${unit}`
      : `${displayTemp(s.fromF, unit)}–${displayTemp(s.toF, unit)}°${unit}`;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
          <Button variant="outline" size="sm" onClick={run}>
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
        <p className="mt-4 text-sm text-destructive">{state.message}</p>
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
