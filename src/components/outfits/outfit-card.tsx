import { useState, useTransition } from "react";
import { GarmentImage } from "@/components/garment-image";
import { AlertTriangle, Bookmark, Check, Loader2 } from "lucide-react";
import type { MatchLevel, Outfit } from "@/lib/outfit-engine";
import type { OutfitRequest } from "@/lib/outfit-engine";
import { toggleSaveOutfit } from "@/app/outfits/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS } from "@/types/wardrobe";
import { cn } from "@/lib/utils";

const MATCH_LABEL: Record<MatchLevel, string> = {
  exact: "Spot on",
  close: "Close match",
  alternative: "Alternative",
};

/* Column count follows the piece count so a three-piece look never leaves an
   empty cell: 2 across for a dress + shoes, 3 for top/bottom/shoes, 2x2 once
   outerwear joins. */
const COLUMNS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2",
};

const MATCH_STYLE: Record<MatchLevel, string> = {
  exact: "border-transparent bg-primary text-primary-foreground",
  close: "border-transparent bg-secondary text-secondary-foreground",
  alternative: "border-transparent bg-muted text-muted-foreground",
};

export function OutfitCard({
  outfit,
  rank,
  request,
  saved,
  onToggle,
}: {
  outfit: Outfit;
  rank: number;
  request?: OutfitRequest;
  saved?: boolean;
  onToggle?: (id: string, nextSaved: boolean) => void;
}) {
  const [isSaved, setIsSaved] = useState(!!saved);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    if (!request) return;
    startTransition(async () => {
      const result = await toggleSaveOutfit(outfit, request);
      if (result.ok) {
        setIsSaved(result.saved);
        onToggle?.(outfit.id, result.saved);
      }
    });
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-xs font-medium text-muted-foreground">
          Look {rank}
        </span>
        <div className="flex items-center gap-2">
          <Badge className={cn(MATCH_STYLE[outfit.matchLevel])}>
            {MATCH_LABEL[outfit.matchLevel]}
          </Badge>
          {request && (
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-7", isSaved && "text-primary")}
              onClick={handleSave}
              disabled={pending}
              title={isSaved ? "Unsave" : "Save outfit"}
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Bookmark className={cn("size-3.5", isSaved && "fill-current")} />
              )}
            </Button>
          )}
        </div>
      </div>

      <div className={cn("grid gap-px bg-border", COLUMNS[outfit.items.length])}>
        {outfit.items.map((item) => (
          <div key={item.id} className="bg-card p-2.5">
            <div className="garment-tile relative aspect-square overflow-hidden rounded-md">
              <GarmentImage
                src={item.display_url}
                alt={item.item_name}
                sizes="(max-width: 640px) 33vw, 160px"
              />
            </div>
            <p className="mt-1.5 truncate text-xs font-medium">
              {item.item_name}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {CATEGORY_LABELS[item.category]}
            </p>
          </div>
        ))}
      </div>

      {outfit.compromises.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-border px-4 py-3.5">
          {outfit.compromises.map((note) => (
            <li key={note} className="flex gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}

      {outfit.reasons.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-border px-4 py-3.5">
          {outfit.reasons.slice(0, 3).map((reason) => (
            <li key={reason} className="flex gap-2 text-xs text-muted-foreground">
              <Check className="mt-px size-3.5 shrink-0" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
