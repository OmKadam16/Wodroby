"use client";

import { useState, useTransition } from "react";
import { GarmentImage } from "@/components/garment-image";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteItem } from "@/app/wardrobe/actions";
import type { WardrobeItemView } from "@/lib/storage";
import { CATEGORY_LABELS } from "@/types/wardrobe";
import { seasonFromRange } from "@/lib/outfit-engine";

export function ItemCard({ item }: { item: WardrobeItemView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
        <GarmentImage
          src={item.display_url}
          alt={item.item_name}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 220px"
        />
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
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
        {CATEGORY_LABELS[item.category]} ·{" "}
        {seasonFromRange(item.min_temp_f, item.max_temp_f)}
      </p>

      {error && (
        <p className="mt-1 rounded bg-destructive px-1.5 py-1 text-center text-[11px] text-destructive-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
