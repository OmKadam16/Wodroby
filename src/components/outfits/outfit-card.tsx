import { useState, useTransition } from "react";
import { GarmentImage } from "@/components/garment-image";
import { AlertTriangle, Bookmark, Check, Loader2, Sparkles, X } from "lucide-react";
import type { MatchLevel, Outfit, OutfitRequest } from "@/lib/outfit-engine";
import { useTempUnit } from "@/components/temp-unit-toggle";
import { displayTempText } from "@/lib/temp";
import { dismissOutfit, toggleSaveOutfit } from "@/app/outfits/actions";
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

/**
 * A look is always laid out as a filled rectangle: four cells up to four
 * pieces, six beyond that, with blanks making up the difference.
 *
 * The count used to pick the column class from a lookup table, which had no
 * entry for five — so a five-piece look got `grid` with no column template at
 * all and collapsed into one tall column running down the card.
 *
 * Generalised past six for safety, though the engine tops out at five
 * (top, bottom, layer, shoes, accessory).
 */
function gridFor(count: number): { columns: number; cells: number; className: string } {
  const columns = count <= 4 ? 2 : 3;
  const cells = Math.max(columns * 2, Math.ceil(count / columns) * columns);
  return { columns, cells, className: columns === 2 ? "grid-cols-2" : "grid-cols-3" };
}

export function OutfitCard({
  outfit,
  rank,
  request,
  saved,
  onToggle,
  onDismiss,
}: {
  outfit: Outfit;
  rank: number;
  request?: OutfitRequest;
  saved?: boolean;
  onToggle?: (id: string, nextSaved: boolean) => void;
  /** Called once the look has been dismissed, so the list can drop it. */
  onDismiss?: (id: string) => void;
}) {
  const [isSaved, setIsSaved] = useState(!!saved);
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [unit] = useTempUnit();
  const MatchIcon = MATCH_ICON[outfit.matchLevel];
  const layout = gridFor(outfit.items.length);

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

  /*
   * Dismissing hides the look and records that it was not wanted.
   *
   * The card goes immediately rather than waiting on the round trip: the
   * record is bookkeeping for a future preference model, and no one should
   * watch a spinner to say "not this one".
   */
  function handleDismiss() {
    if (!request) return;
    setDismissed(true);
    onDismiss?.(outfit.id);
    void dismissOutfit(outfit, request);
  }

  if (dismissed) return null;

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
            className="ml-auto size-11 shrink-0 text-muted-foreground"
            onClick={handleDismiss}
            title="Not this one"
          >
            <X className="size-4" />
            <span className="sr-only">Dismiss this look</span>
          </Button>
        )}
        {request && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "-mr-2 size-11 shrink-0",
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

      <div className={cn("grid gap-2 px-3.5", layout.className)}>
        {outfit.items.map((item) => (
          <div key={item.id}>
            <div className="garment-tile relative aspect-square overflow-hidden rounded-xl">
              <GarmentImage
                src={item.display_url}
                alt={item.item_name}
                sizes={
                  layout.columns === 2
                    ? "(max-width: 640px) 45vw, 200px"
                    : "(max-width: 640px) 30vw, 140px"
                }
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

        {/* Keeps the rectangle square. Dashed and quiet so it reads as room
            left over rather than an image that failed to load. Hidden from
            screen readers, which should hear the pieces and nothing else. */}
        {Array.from({ length: layout.cells - outfit.items.length }, (_, i) => (
          <div key={`empty-${i}`} aria-hidden="true">
            <div className="aspect-square rounded-xl border border-dashed border-border opacity-60" />
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
