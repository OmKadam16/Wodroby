"use client";

import { useMemo, useState } from "react";
import { Shirt, Sun, Snowflake, CloudRain } from "lucide-react";
import { ItemCard } from "@/components/wardrobe/item-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WardrobeItemView } from "@/lib/storage";
import type { Category } from "@/types/wardrobe";
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

const SEASON_CHIPS: { id: string; label: string; icon: typeof Sun; temp: number | null }[] = [
  { id: "any", label: "Any", icon: Sun, temp: null },
  { id: "summer", label: "Summer", icon: Sun, temp: 85 },
  { id: "winter", label: "Winter", icon: Snowflake, temp: 40 },
  { id: "rainy", label: "Rainy", icon: CloudRain, temp: 60 },
];

export function WardrobeGrid({ items }: { items: WardrobeItemView[] }) {
  const [tab, setTab] = useState("all");
  const [season, setSeason] = useState("any");

  const filtered = useMemo(() => {
    const categories = TABS.find((t) => t.value === tab)?.categories ?? [];
    const chip = SEASON_CHIPS.find((s) => s.id === season);
    const tempValue = chip?.temp ?? null;
    return items.filter((item) => {
      if (categories.length > 0 && !categories.includes(item.category)) return false;
      if (tempValue !== null && (item.min_temp_f > tempValue || item.max_temp_f < tempValue)) return false;
      return true;
    });
  }, [items, tab, season]);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
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

      <div className="flex flex-wrap items-center gap-2">
        {SEASON_CHIPS.map((s) => {
          const Icon = s.icon;
          const active = season === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSeason(s.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium active:scale-95",
                active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent",
              )}
            >
              <Icon className="size-3.5" />
              {s.label}
            </button>
          );
        })}
        <span className="ml-2 text-xs text-muted-foreground">{filtered.length} of {items.length}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <Shirt className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">{items.length === 0 ? "Your wardrobe is empty" : "Nothing matches"}</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {items.length === 0 ? "Tap + and add a few photos — one season tap per item is enough." : "Try another season filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
