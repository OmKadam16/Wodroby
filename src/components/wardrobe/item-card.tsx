"use client";

import { useState, useTransition } from "react";
import { GarmentImage } from "@/components/garment-image";
import { useRouter } from "next/navigation";
import { Droplets, Loader2, Trash2, WashingMachine } from "lucide-react";
import { deleteItem, setInWash } from "@/app/wardrobe/actions";
import type { WardrobeItemView } from "@/lib/storage";
import { CATEGORY_LABELS, isInWash } from "@/types/wardrobe";
import { itemSeasons, seasonSummary } from "@/lib/seasons";
import { cn } from "@/lib/utils";

export function ItemCard({ item }: { item: WardrobeItemView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [washPending, startWash] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inWash = isInWash(item);

  function handleWash() {
    startWash(async () => {
      const result = await setInWash([item.id], !inWash);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteItem(item.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="group">
      <div className="garment-tile relative aspect-square overflow-hidden rounded-xl">
        <div className={cn("size-full transition-opacity", inWash && "opacity-50")}>
          <GarmentImage
            src={item.display_url}
            alt={item.item_name}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 220px"
          />
        </div>
        {/* Stays visible while the piece is in the wash, so the way back out
            is where the way in was. */}
        <button
          type="button"
          onClick={handleWash}
          disabled={washPending}
          aria-pressed={inWash}
          title={inWash ? "Mark clean" : "Put in the wash"}
          className={cn(
            "absolute left-1.5 top-1.5 z-10 flex size-8 items-center justify-center rounded-full border shadow-sm backdrop-blur transition focus-visible:opacity-100",
            inWash
              ? "border-transparent bg-primary text-primary-foreground"
              : "border-border bg-surface/90 text-muted-foreground hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100",
          )}
        >
          {washPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <WashingMachine className="size-3.5" />
          )}
          <span className="sr-only">
            {inWash ? `Mark ${item.item_name} clean` : `Put ${item.item_name} in the wash`}
          </span>
        </button>
        {/* Always reachable on touch; hover-revealed from sm: up. */}
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          title="Delete item"
          className="absolute right-1.5 top-1.5 z-10 flex size-8 items-center justify-center rounded-full border border-border bg-surface/90 text-muted-foreground shadow-sm backdrop-blur transition hover:text-destructive focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          <span className="sr-only">Delete {item.item_name}</span>
        </button>
      </div>

      <p className="mt-2 truncate text-[13px] leading-tight">
        {item.item_name}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
        <span className="truncate">
          {CATEGORY_LABELS[item.category]} · {seasonSummary(itemSeasons(item))}
        </span>
        {/* An icon rather than another word — the line is already tight. */}
        {item.rain_ready && (
          <Droplets className="size-3 shrink-0 text-rainy" aria-label="Rain-ready" />
        )}
      </p>
      {inWash && (
        <p className="mt-0.5 text-[11px] font-medium text-clay-ink">In the wash</p>
      )}

      {error && (
        <p className="mt-1 rounded bg-destructive px-1.5 py-1 text-center text-[11px] text-destructive-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
