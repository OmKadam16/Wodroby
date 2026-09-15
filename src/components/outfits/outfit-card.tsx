import { useState, useTransition } from "react";
import { GarmentImage } from "@/components/garment-image";
import { AlertTriangle, Bookmark, Check, Loader2, Sparkles } from "lucide-react";
import type { MatchLevel, Outfit, OutfitRequest } from "@/lib/outfit-engine";
import { useTempUnit } from "@/components/temp-unit-toggle";
import { displayTempText } from "@/lib/temp";
import { toggleSaveOutfit } from "@/app/outfits/actions";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS } from "@/types/wardrobe";
import { cn } from "@/lib/utils";

const MATCH_LABEL: Record<MatchLevel, string> = {
  exact: "Spot on",
  close: "Close match",
  alternative: "Alternative",
};

/* The three levels differ by fill, border style AND icon — never by colour
   alone, so the distinction survives a colour-blind reader or a grey print. */
const MATCH_STYLE: Record<MatchLevel, string> = {
  exact: "border border-transparent bg-primary text-primary-foreground font-semibold",
  close: "border border-olive bg-olive-tint text-olive font-semibold",
  alternative: "border border-dashed border-muted-foreground text-muted-foreground font-medium",
};

const MATCH_ICON: Record<MatchLevel, typeof Check> = {
  exact: Sparkles,
  close: Check,
  alternative: AlertTriangle,
};

/* Column count follows the piece count so a three-piece look never leaves an
   empty cell: 2 across for a dress + shoes, 3 for top/bottom/shoes, 2x2 once
   outerwear joins. */
const COLUMNS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2",
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
  const [unit] = useTempUnit();
  const MatchIcon = MATCH_ICON[outfit.matchLevel];

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
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 px-3.5 pb-3 pt-3.5">
        <span className="display text-xl">Look {rank}</span>
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] uppercase tracking-[0.06em]",
            MATCH_STYLE[outfit.matchLevel],
          )}
        >
          <MatchIcon className="size-3" />
          {MATCH_LABEL[outfit.matchLevel]}
        </span>
        {request && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "-mr-2 ml-auto size-11 shrink-0",
              isSaved ? "text-clay-ink" : "text-muted-foreground",
            )}
            onClick={handleSave}
            disabled={pending}
            title={isSaved ? "Unsave" : "Save outfit"}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Bookmark className={cn("size-4", isSaved && "fill-current")} />
            )}
          </Button>
        )}
      </div>

      <div className={cn("grid gap-2 px-3.5", COLUMNS[outfit.items.length])}>
        {outfit.items.map((item) => (
          <div key={item.id}>
            <div className="garment-tile relative aspect-square overflow-hidden rounded-xl">
              <GarmentImage
                src={item.display_url}
                alt={item.item_name}
                sizes="(max-width: 640px) 33vw, 160px"
              />
            </div>
            <p className="mt-2 truncate text-[13px] leading-tight">
              {item.item_name}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {CATEGORY_LABELS[item.category]}
            </p>
          </div>
        ))}
      </div>

      {(outfit.reasons.length > 0 || outfit.compromises.length > 0) && (
        <ul className="mt-3.5 flex flex-col gap-[7px] border-t border-border px-3.5 py-4">
          {outfit.reasons.slice(0, 3).map((reason) => (
            <li key={reason} className="flex gap-2 text-[13px] leading-[1.45]">
              <Check className="mt-0.5 size-3.5 shrink-0 text-olive" />
              <span>{displayTempText(reason, unit)}</span>
            </li>
          ))}
          {outfit.compromises.map((note) => (
            <li
              key={note}
              className="flex gap-2 text-[13px] leading-[1.45] text-muted-foreground"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-clay-ink" />
              <span>{displayTempText(note, unit)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
