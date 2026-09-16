"use client";

import { useMemo, useState } from "react";
import { Shirt, Sun, Snowflake, Sprout, Leaf, Sparkles } from "lucide-react";
import { ItemCard } from "@/components/wardrobe/item-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WardrobeItemView } from "@/lib/storage";
import type { Category, Season } from "@/types/wardrobe";
import { itemSeasons } from "@/lib/seasons";
import { cn } from "@/lib/utils";

const TABS: { value: string; label: string; categories: Category[] }[] = [
  { value: "all", label: "All", categories: [] },
  { value: "tops", label: "Tops", categories: ["top"] },
  { value: "bottoms", label: "Bottoms", categories: ["bottom"] },
  { value: "one_piece", label: "One pieces", categories: ["one_piece"] },
  { value: "outerwear", label: "Outerwear", categories: ["outerwear"] },
  { value: "shoes", label: "Shoes", categories: ["footwear"] },
  { value: "accessories", label: "Accessories", categories: ["accessory"] },
];

/* Each season chip carries its own weather colour, so the row reads as a
   spectrum rather than four identical pills. */
const SEASON_CHIPS: {
  id: string;
  label: string;
  icon: typeof Sun;
  season: Season | null;
  tone: string;
}[] = [
  { id: "any", label: "All", icon: Sparkles, season: null, tone: "text-muted-foreground" },
  { id: "spring", label: "Spring", icon: Sprout, season: "spring", tone: "text-spring" },
  { id: "summer", label: "Summer", icon: Sun, season: "summer", tone: "text-sunny" },
  { id: "fall", label: "Fall", icon: Leaf, season: "fall", tone: "text-fall" },
  { id: "winter", label: "Winter", icon: Snowflake, season: "winter", tone: "text-snowy" },
];

export function WardrobeGrid({ items }: { items: WardrobeItemView[] }) {
  const [tab, setTab] = useState("all");
  const [season, setSeason] = useState("any");

  const filtered = useMemo(() => {
    const categories = TABS.find((t) => t.value === tab)?.categories ?? [];
    const wanted = SEASON_CHIPS.find((s) => s.id === season)?.season ?? null;
    return items.filter((item) => {
      if (categories.length > 0 && !categories.includes(item.category)) return false;
      if (wanted && !itemSeasons(item).includes(wanted)) return false;
      return true;
    });
  }, [items, tab, season]);

  const isFiltered = tab !== "all" || season !== "any";

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="scroll-row -mx-4 px-4 pb-1 sm:mx-0 sm:px-0">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <div className="scroll-row -mx-4 flex gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {SEASON_CHIPS.map((s) => {
          const Icon = s.icon;
          const active = season === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSeason(s.id)}
              aria-pressed={active}
              className={cn(
                "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition active:scale-95",
                active
                  ? "border-primary bg-primary font-medium text-primary-foreground"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              <Icon
                className={cn("size-3.5", active ? "text-primary-foreground" : s.tone)}
              />
              {s.label}
            </button>
          );
        })}
      </div>

      <p className="eyebrow">
        {isFiltered
          ? `${filtered.length} of ${items.length}`
          : `${items.length} ${items.length === 1 ? "piece" : "pieces"}`}
      </p>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-sunken">
            <Shirt className="size-5 text-muted-foreground" />
          </span>
          <p className="text-sm font-medium">
            {items.length === 0 ? "Your wardrobe is empty" : "Nothing matches"}
          </p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {items.length === 0
              ? "Tap + to add your first piece."
              : "Try another filter."}
          </p>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setTab("all");
                setSeason("any");
              }}
              className="text-[13px] font-medium text-clay-ink underline underline-offset-4"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
