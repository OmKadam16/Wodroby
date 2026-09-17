"use client";

import { useState } from "react";
import { Loader2, ScanLine } from "lucide-react";
import {
  applyAnalysis,
  getItemsForReanalysis,
  type ReanalysisTarget,
} from "@/app/wardrobe/actions";
import { readGarment, suggestionFor } from "@/lib/vision/analyze";
import { CATEGORY_ENTRIES } from "@/lib/vision/prompts";
import { isSeason, type Season } from "@/types/wardrobe";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Re-reads every garment already in the wardrobe.
 *
 * Items added before the reader existed, or before it kept the colour
 * coordinates the outfit engine now scores on, carry less than the app can
 * use. This runs the same pipeline an upload runs, over photos already stored.
 *
 * It runs here, in the browser, for the same reason the original analysis does:
 * the photograph is fetched from the wearer's own storage, read on their
 * device, and only the resulting words and numbers are sent back. Nothing is
 * uploaded and the stored file is never rewritten.
 */

type Row = {
  name: string;
  colorBefore: string;
  colorAfter: string;
  attrsBefore: string;
  attrsAfter: string;
  seasonsBefore: string;
  seasonsAfter: string;
  /** Set when the model reads a different garment type than the one stored. */
  disagreement: string | null;
  failed: boolean;
};

const ENTRY_BY_ID = new Map(CATEGORY_ENTRIES.map((e) => [e.id, e]));
const SEASON_ORDER = ["spring", "summer", "fall", "winter"];
const shortSeasons = (seasons: string[]) =>
  SEASON_ORDER.filter((s) => seasons.includes(s))
    .map((s) => s.slice(0, 2))
    .join(" ") || "none";
const attrs = (
  a: string | null,
  b: string | null,
  c: string | null,
) => [a, b, c].map((v) => v ?? "-").join("/");

export function ReanalysePanel() {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setRows([]);
    setDone(0);
    setState("running");

    const listed = await getItemsForReanalysis();
    if (!listed.ok) {
      setError(listed.error);
      setState("idle");
      return;
    }
    setTotal(listed.items.length);

    const collected: Row[] = [];
    for (const item of listed.items) {
      setCurrent(item.item_name);
      const row = await reanalyse(item);
      collected.push(row);
      setRows([...collected]);
      setDone(collected.length);
    }

    setCurrent(null);
    setState("done");
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <ScanLine className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Re-read your wardrobe</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Runs the analyser over every photo you have already added, filling
            in colour and fabric readings that older items never got. Your
            photos stay on this device and are not changed.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={state === "running"} variant="outline">
          {state === "running" && <Loader2 className="size-4 animate-spin" />}
          {state === "running"
            ? `Reading ${done + 1} of ${total}`
            : state === "done"
              ? "Run again"
              : "Re-read everything"}
        </Button>
        {state === "running" && current && (
          <span className="text-[13px] text-muted-foreground">{current}</span>
        )}
        {state === "done" && (
          <span className="text-[13px] text-muted-foreground">
            {rows.filter((r) => !r.failed).length} of {rows.length} read.
          </span>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {rows.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="border-b border-border pb-2 pr-3 font-medium">Item</th>
                <th className="border-b border-border pb-2 pr-3 font-medium">Colour</th>
                <th className="border-b border-border pb-2 pr-3 font-medium">
                  Sleeve / weight / warmth
                </th>
                <th className="border-b border-border pb-2 font-medium">Seasons</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className="align-top">
                  <td className="border-b border-border py-2 pr-3">
                    {row.name}
                    {row.disagreement && (
                      <span className="mt-1 block text-[12px] text-clay-ink">
                        {row.disagreement}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-border py-2 pr-3">
                    <Change before={row.colorBefore} after={row.colorAfter} />
                  </td>
                  <td className="border-b border-border py-2 pr-3">
                    <Change before={row.attrsBefore} after={row.attrsAfter} />
                  </td>
                  <td className="border-b border-border py-2">
                    <Change before={row.seasonsBefore} after={row.seasonsAfter} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Shows a value, and what it used to be only when that differs. */
function Change({ before, after }: { before: string; after: string }) {
  if (before === after) return <span className="text-muted-foreground">{after}</span>;
  return (
    <span>
      <span className="text-muted-foreground line-through">{before}</span>{" "}
      <span className={cn("font-medium text-clay-ink")}>{after}</span>
    </span>
  );
}

async function reanalyse(item: ReanalysisTarget): Promise<Row> {
  const base: Row = {
    name: item.item_name,
    colorBefore: item.primary_color,
    colorAfter: item.primary_color,
    attrsBefore: attrs(item.sleeve_length, item.apparent_weight, item.warmth),
    attrsAfter: attrs(item.sleeve_length, item.apparent_weight, item.warmth),
    seasonsBefore: shortSeasons(item.seasons),
    seasonsAfter: shortSeasons(item.seasons),
    disagreement: null,
    failed: false,
  };

  try {
    if (!item.source_url) return { ...base, failed: true };
    const response = await fetch(item.source_url);
    if (!response.ok) return { ...base, failed: true };
    const blob = await response.blob();
    const file = new File([blob], `${item.id}.webp`, {
      type: blob.type || "image/webp",
    });

    const reading = await readGarment(file);
    if (!reading) return { ...base, failed: true };

    const top = reading.analysis.categoryOptions[0];
    const entry = top ? ENTRY_BY_ID.get(top.value.id) : undefined;

    /*
     * Seasons are narrowed from what the item already claims, never rebuilt
     * from the garment type. A season chosen by hand is evidence; the type
     * default is only a guess for a garment nothing is known about.
     */
    const suggestion = entry ? suggestionFor(reading.analysis, entry) : null;

    const claimed = item.seasons.filter(isSeason);
    const proposed = suggestion?.seasons ?? [];
    // Narrowed against what the item already claims, and never emptied: if the
    // two sets do not overlap the stored answer stands.
    const narrowed = proposed.filter((s) => claimed.includes(s));
    const seasons: Season[] =
      narrowed.length > 0 ? narrowed : claimed.length > 0 ? claimed : proposed;

    if (seasons.length === 0) return { ...base, failed: true };

    const patch = {
      primary_color: reading.primaryColor ?? item.primary_color,
      secondary_colors: reading.secondaryColors,
      color_l: reading.colorLch?.l ?? null,
      color_c: reading.colorLch?.c ?? null,
      color_h: reading.colorLch?.h ?? null,
      sleeve_length: suggestion?.sleeveLength ?? item.sleeve_length,
      apparent_weight: suggestion?.apparentWeight ?? item.apparent_weight,
      warmth: suggestion?.warmth ?? item.warmth,
      seasons,
    };

    const saved = await applyAnalysis(item.id, patch);
    if (!saved.ok) return { ...base, failed: true };

    return {
      ...base,
      colorAfter: patch.primary_color,
      attrsAfter: attrs(
        patch.sleeve_length,
        patch.apparent_weight,
        patch.warmth,
      ),
      seasonsAfter: shortSeasons(patch.seasons),
      // Reported, never applied: the stored type may well be a correction
      // somebody made on purpose.
      disagreement:
        entry && entry.sub_category !== item.sub_category
          ? `reads as ${entry.sub_category}, kept as ${item.sub_category}`
          : null,
    };
  } catch {
    return { ...base, failed: true };
  }
}
