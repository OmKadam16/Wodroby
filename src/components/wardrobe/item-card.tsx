"use client";

import { useState, useTransition } from "react";
import { GarmentImage } from "@/components/garment-image";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteItem } from "@/app/wardrobe/actions";
import type { WardrobeItemView } from "@/lib/storage";

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
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-square">
        <GarmentImage
          src={item.display_url}
          alt={item.item_name}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 220px"
        />
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          title="Delete item"
          className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-card/90 text-muted-foreground shadow-sm backdrop-blur transition-opacity hover:text-destructive focus-visible:opacity-100 sm:size-8 sm:opacity-0 sm:group-hover:opacity-100"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
          <span className="sr-only">Delete {item.item_name}</span>
        </button>
      </div>
      {error && (
        <p className="absolute bottom-1 left-1 right-1 rounded bg-destructive px-1.5 py-1 text-center text-[11px] text-destructive-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
