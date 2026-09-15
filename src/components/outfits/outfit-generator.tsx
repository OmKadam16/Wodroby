"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Bookmark,
  Droplets,
  Info,
  Loader2,
  MapPin,
  Sparkles,
} from "lucide-react";
import {
  generateOutfitsAction,
  getCachedOutfits,
  getSavedOutfits,
} from "@/app/outfits/actions";
import type { Outfit, OutfitRequest } from "@/lib/outfit-engine";
import { seasonFromTemp } from "@/lib/outfit-engine";
import type { Weather, WeatherCondition } from "@/lib/weather";
import { OCCASIONS, occasionLabel, type Occasion } from "@/types/wardrobe";
import { OutfitCard } from "@/components/outfits/outfit-card";
import { WeatherIcon } from "@/components/outfits/weather-icon";
import { TempUnitToggle, useTempUnit } from "@/components/temp-unit-toggle";
import { cToF, displayTemp, displayTempText } from "@/lib/temp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const DEFAULT_TEMP = 68;

/* The weather header is tinted with the condition's own colour, so the screen
   changes character with the sky instead of always looking the same. */
const CONDITION_TONE: Record<WeatherCondition, string> = {
  sunny: "var(--sunny)",
  cloudy: "var(--cloudy)",
  rainy: "var(--rainy)",
  snowy: "var(--snowy)",
  windy: "var(--cloudy)",
  stormy: "var(--rainy)",
};

/* Five chips fit a phone without scrolling past the fold; the rest live behind
   "All 15" so fifteen options never become chip soup. */
const QUICK_OCCASIONS: Occasion[] = [
  "work",
  "casual_outing",
  "date_night",
  "party",
  "gym",
];

export function OutfitGenerator() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherState, setWeatherState] = useState<"idle" | "loading" | "error">(
    "loading",
  );
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const [temp, setTemp] = useState<number>(DEFAULT_TEMP);
  const [isRainy, setIsRainy] = useState(false);
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [outfits, setOutfits] = useState<Outfit[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"generate" | "saved">("generate");
  const [saved, setSaved] = useState<Outfit[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [unit, setUnit] = useTempUnit();

  const request: OutfitRequest = {
    current_temp_f: temp,
    occasion,
    is_rainy: isRainy,
  };

  const loadWeather = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setWeatherState("error");
      setWeatherError("This browser cannot share your location.");
      return;
    }

    setWeatherState("loading");
    setWeatherError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(
            `/api/weather?lat=${latitude}&lon=${longitude}`,
          );
          const payload = (await response.json()) as {
            weather?: Weather;
            error?: string;
          };
          if (!response.ok || !payload.weather) {
            throw new Error(payload.error ?? "Weather lookup failed.");
          }
          setWeather(payload.weather);
          setTemp(payload.weather.temp_f);
          setIsRainy(payload.weather.is_rainy);
          setWeatherState("idle");
        } catch (err) {
          setWeatherState("error");
          setWeatherError(
            err instanceof Error ? err.message : "Weather lookup failed.",
          );
        }
      },
      () => {
        setWeatherState("error");
        setWeatherError("Location off");
      },
      { timeout: 10_000, maximumAge: 600_000 },
    );
  }, []);

  useEffect(() => {
    getSavedOutfits().then((res) => {
      if (res.ok) {
        setSaved(res.outfits);
        setSavedIds(new Set(res.outfits.map((o) => o.id)));
      }
    });
  }, []);

  useEffect(() => {
    getCachedOutfits({
      current_temp_f: temp,
      occasion,
      is_rainy: isRainy,
    }).then((cached) => {
      if (cached && cached.length > 0) setOutfits(cached);
    });
  }, [temp, occasion, isRainy]);

  useEffect(() => {
    if (weatherState === "loading") return;
    const t = setTimeout(() => {
      handleGenerate();
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temp, occasion, isRainy, weatherState]);

  useEffect(() => {
    const timer = setTimeout(loadWeather, 0);
    return () => clearTimeout(timer);
  }, [loadWeather]);

  function handleGenerate() {
    setError(null);

    startTransition(async () => {
      const result = await generateOutfitsAction({
        current_temp_f: temp,
        occasion,
        is_rainy: isRainy,
      });

      if (!result.ok) {
        setError(result.error);
        setOutfits(null);
        return;
      }

      setOutfits(result.outfits);
      setNotice(result.notice);
      setEmptyReason(result.emptyReason);
    });
  }

  const season = seasonFromTemp(temp, isRainy);
  const seasonLabel =
    season === "summer"
      ? "Summer"
      : season === "winter"
        ? "Winter"
        : season === "rainy"
          ? "Rainy"
          : "All-season";
  const tone = weather ? CONDITION_TONE[weather.condition] : "var(--cloudy)";

  return (
    <div className="flex flex-col gap-5">
      {/* ---------------------------------------------------------------- */}
      {/* Weather header                                                   */}
      {/* ---------------------------------------------------------------- */}
      <div
        className="rounded-2xl border border-border p-[18px]"
        style={{
          background: `color-mix(in oklab, ${tone} 12%, var(--surface))`,
        }}
      >
        {weatherState === "loading" ? (
          <div className="flex items-center gap-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            Reading the weather…
          </div>
        ) : weather ? (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Your location</p>
              <p className="mt-1.5 flex items-baseline gap-2.5">
                <span className="display text-6xl leading-[0.9] tracking-[-0.03em]">
                  {displayTemp(weather.temp_f, unit)}°
                </span>
                <span className="text-[15px] text-muted-foreground">{unit}</span>
              </p>
              <p className="mt-2.5 text-[15px]">
                {weather.description} · feels like {displayTemp(weather.feels_like_f, unit)}°
              </p>
            </div>
            <div className="grid justify-items-end gap-3">
              <WeatherIcon
                condition={weather.condition}
                className="size-8"
                style={{ color: tone }}
              />
              <span className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] uppercase tracking-[0.06em]">
                {seasonLabel}
                {isRainy ? " · Rain" : ""}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <p className="eyebrow">{weatherError ?? "No weather yet"}</p>
              <p className="mt-1 text-[15px]">Set the weather yourself</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={loadWeather}
            >
              <MapPin />
              Use my location
            </Button>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Occasion                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div>
        <div className="flex items-baseline justify-between pb-2.5">
          <span className="eyebrow">Occasion</span>
          <div className="flex items-center gap-3">
            {pending && (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Updating
              </span>
            )}
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="text-[11px] uppercase tracking-[0.06em] underline underline-offset-[3px]"
            >
              All {OCCASIONS.length + 1}
            </button>
          </div>
        </div>

        <div className="scroll-row -mx-4 flex gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <OccasionChip
            active={occasion === null}
            onClick={() => setOccasion(null)}
          >
            <Sparkles className="size-3.5" />
            Anything
          </OccasionChip>
          {/* On a phone only the common few are inline; desktop wraps them all. */}
          {QUICK_OCCASIONS.map((value) => (
            <OccasionChip
              key={value}
              active={occasion === value}
              onClick={() => setOccasion(value)}
            >
              {occasionLabel(value)}
            </OccasionChip>
          ))}
          {OCCASIONS.filter((o) => !QUICK_OCCASIONS.includes(o)).map((value) => (
            <OccasionChip
              key={value}
              active={occasion === value}
              onClick={() => setOccasion(value)}
              className="hidden sm:inline-flex"
            >
              {occasionLabel(value)}
            </OccasionChip>
          ))}
        </div>
      </div>

      {/* All-occasions sheet */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Occasion</DialogTitle>
          <div className="mt-4 flex flex-wrap gap-2">
            <DialogClose asChild>
              <OccasionChip
                active={occasion === null}
                onClick={() => setOccasion(null)}
              >
                <Sparkles className="size-3.5" />
                Anything
              </OccasionChip>
            </DialogClose>
            {OCCASIONS.map((value) => (
              <DialogClose asChild key={value}>
                <OccasionChip
                  active={occasion === value}
                  onClick={() => setOccasion(value)}
                >
                  {occasionLabel(value)}
                </OccasionChip>
              </DialogClose>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------------------- */}
      {/* Controls                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex h-11 shrink-0 items-center gap-2 rounded-[10px] border border-border bg-card px-3">
          <label htmlFor="temp" className="eyebrow">
            Temp
          </label>
          <Input
            id="temp"
            type="number"
            value={displayTemp(temp, unit)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              setTemp(unit === "C" ? Math.round(cToF(n)) : Math.round(n));
            }}
            className="h-auto w-12 border-0 bg-transparent p-0 text-[15px] shadow-none focus-visible:ring-0"
          />
        </div>

        <TempUnitToggle unit={unit} onChange={setUnit} />

        <button
          type="button"
          onClick={() => setIsRainy((v) => !v)}
          aria-pressed={isRainy}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-[10px] border px-3 text-[13px] transition active:scale-95",
            isRainy
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-accent",
          )}
        >
          <Droplets className="size-4" />
          Raining
        </button>

        <Button
          onClick={handleGenerate}
          disabled={pending}
          variant="outline"
          className="ml-auto h-11 w-11 p-0 sm:w-auto sm:px-4"
          title="Shuffle"
        >
          <Sparkles className={cn(pending && "animate-spin")} />
          <span className="hidden sm:inline">Shuffle</span>
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* ---------------------------------------------------------------- */}
      {/* Results                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex gap-6 border-b border-border">
        {(
          [
            ["generate", "Generated"],
            ["saved", `Saved (${saved.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "border-b-2 pb-2.5 text-[13px] uppercase tracking-[0.06em] transition",
              tab === value
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "saved" ? (
        saved.length === 0 ? (
          <EmptyState
            icon={<Bookmark className="size-5 text-muted-foreground" />}
            title="Nothing saved yet"
            body="Bookmark a look to keep it."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 2xl:grid-cols-4">
            {saved.map((outfit, index) => (
              <OutfitCard
                key={outfit.id}
                outfit={outfit}
                rank={index + 1}
                request={request}
                saved
                onToggle={(id, nextSaved) => {
                  if (!nextSaved) {
                    setSaved((prev) => prev.filter((o) => o.id !== id));
                    setSavedIds((prev) => {
                      const n = new Set(prev);
                      n.delete(id);
                      return n;
                    });
                  }
                }}
              />
            ))}
          </div>
        )
      ) : (
        <>
          {outfits && outfits.length > 0 && notice && (
            <div className="flex gap-3 rounded-2xl border border-border bg-muted/60 p-4">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-[13px] leading-[1.45]">{displayTempText(notice, unit)}</p>
            </div>
          )}

          {outfits && outfits.length === 0 && (
            <EmptyState
              title={`No outfits for ${displayTemp(temp, unit)}°${unit}${isRainy ? " and rain" : ""}`}
              body={displayTempText(emptyReason ?? "", unit)}
            />
          )}

          {outfits && outfits.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 2xl:grid-cols-4">
              {outfits.map((outfit, index) => (
                <OutfitCard
                  key={outfit.id}
                  outfit={outfit}
                  rank={index + 1}
                  request={request}
                  saved={savedIds.has(outfit.id)}
                  onToggle={(id, nextSaved) => {
                    setSavedIds((prev) => {
                      const n = new Set(prev);
                      if (nextSaved) n.add(id);
                      else n.delete(id);
                      return n;
                    });
                    if (nextSaved) {
                      const found = outfits.find((o) => o.id === id);
                      if (found)
                        setSaved((prev) => [
                          found,
                          ...prev.filter((o) => o.id !== id),
                        ]);
                    } else {
                      setSaved((prev) => prev.filter((o) => o.id !== id));
                    }
                  }}
                />
              ))}
            </div>
          )}

          {!outfits && !pending && (
            <EmptyState
              icon={<Sparkles className="size-5 text-muted-foreground" />}
              title="No looks yet"
              body="Pick an occasion, or tap Shuffle."
            />
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon?: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      {icon && (
        <span className="flex size-11 items-center justify-center rounded-full bg-sunken">
          {icon}
        </span>
      )}
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="max-w-xs text-sm text-muted-foreground">{body}</p>}
    </div>
  );
}

function OccasionChip({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
        active
          ? "bg-primary font-medium text-primary-foreground"
          : "border border-border bg-card text-foreground hover:bg-accent",
        className,
      )}
    >
      {children}
    </button>
  );
}
