"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Camera, Droplets, ImageUp, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toCompressedFile } from "@/lib/image";
import { BUCKET } from "@/lib/storage";
import { saveItem } from "@/app/wardrobe/actions";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  SEASONS,
  SEASON_LABELS,
  SUB_CATEGORIES,
  isSeason,
  type Category,
  type Season,
} from "@/types/wardrobe";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { deriveSeasons } from "@/lib/seasons";
import { readGarment, suggestionFor, type GarmentSuggestion } from "@/lib/vision/analyze";
import type { ClothingAnalysis } from "@/lib/vision/classify";
import { COLOR_NAMES } from "@/lib/vision/color";
import {
  getServerVisionStatus,
  getVisionStatus,
  preloadVisionModel,
  subscribeVisionStatus,
} from "@/lib/vision/model";
import { CATEGORY_ENTRIES } from "@/lib/vision/prompts";
import {
  FORMALITIES,
  FORMALITY_LABELS,
  SLEEVE_LABELS,
  WARMTH_LABELS,
  WEIGHT_LABELS,
  type ApparentWeight,
  type Formality,
  type SleeveLength,
  type WarmthLevel,
} from "@/types/wardrobe";

const SEASON_DESC: Record<Season, string> = {
  spring: "Mild & fresh",
  summer: "Hot & sunny",
  fall: "Cool & crisp",
  winter: "Cold & snowy",
};

/* Rain is not a season — it cuts across all four. Pieces that obviously shrug
   off weather start ticked so the common case costs no taps. */
const RAIN_READY_SUBS = new Set(["windbreaker", "parka", "coat", "boots"]);

type PendingFile = { id: string; file: File; preview_url: string };

/** Where a draft is in the analysis pipeline. "skipped" covers every way the
 *  model can fail to be there — no WebGPU, no network, an unreadable photo —
 *  because none of them change what the user has to do. */
type AnalysisState = "waiting" | "running" | "done" | "skipped";

type Draft = {
  id: string;
  file: File;
  preview_url: string;
  item_name: string;
  category: Category;
  sub_category: string;
  seasons: Season[];
  rain_ready: boolean;
  primary_color: string;
  secondary_colors: string[];
  /** Set by the reader, cleared the moment the colour is chosen by hand. */
  color_lch: { l: number; c: number; h: number } | null;
  sleeve_length: SleeveLength | null;
  apparent_weight: ApparentWeight | null;
  warmth: WarmthLevel | null;
  formality: Formality;
  analysis: AnalysisState;
  /** The reading, kept so a manual category pick can be re-resolved against it
   *  without running the model again. */
  reading: ClothingAnalysis | null;
  /** True once the model's own pick was used, so the UI can say where the
   *  values came from. Cleared the moment the user overrides anything. */
  suggested: boolean;
  /** Whether the seasons are the user's own choice rather than a value
   *  carried over from the last item they added. Without this the remembered
   *  default outranks what the model reads off the photo. */
  seasonsTouched: boolean;
};

/* Bumped from `wardroby_last_add`: the old value holds a single season id, and
   two of those ids ("rainy", "all") are not seasons any more. Reading one back
   would push an invalid value straight into the insert. One lost preference is
   cheaper than a constraint error on save. */
const LAST_KEY = "wardroby_last_add_v2";

type LastPick = { category: Category; sub: string; seasons: Season[] };

function loadLast(): LastPick | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p?.category || !Array.isArray(p.seasons)) return null;
    const seasons = p.seasons.filter((v: unknown) => typeof v === "string" && isSeason(v));
    if (seasons.length === 0) return null;
    return { category: p.category, sub: p.sub, seasons };
  } catch {}
  return null;
}

function saveLast(category: Category, sub: string, seasons: Season[]) {
  if (seasons.length === 0) return;
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ category, sub, seasons }));
  } catch {}
}

function makeDraft(p: PendingFile, fallback?: LastPick): Draft {
  const cat = fallback?.category ?? "top";
  const sub = fallback?.sub ?? SUB_CATEGORIES[cat][0];
  return {
    id: p.id,
    file: p.file,
    preview_url: p.preview_url,
    item_name: "",
    category: cat,
    sub_category: sub,
    seasons: fallback?.seasons ?? [],
    rain_ready: RAIN_READY_SUBS.has(sub),
    primary_color: "unknown",
    secondary_colors: [],
    color_lch: null,
    sleeve_length: null,
    apparent_weight: null,
    warmth: null,
    formality: "casual",
    analysis: "waiting",
    reading: null,
    suggested: false,
    seasonsTouched: false,
  };
}

/** Applies a resolved suggestion to a draft, leaving anything the user has
 *  already touched alone. */
function withSuggestion(draft: Draft, suggestion: GarmentSuggestion): Draft {
  return {
    ...draft,
    category: suggestion.category,
    sub_category: suggestion.subCategory,
    sleeve_length: suggestion.sleeveLength,
    apparent_weight: suggestion.apparentWeight,
    warmth: suggestion.warmth,
    formality: suggestion.formality ?? draft.formality,
    // Only a season the user actually chose survives. The prefilled value is
    // a guess carried from the last item they added, about a different
    // garment, so it must not beat what was read off this photo.
    seasons: draft.seasonsTouched ? draft.seasons : suggestion.seasons,
    rain_ready: draft.rain_ready || RAIN_READY_SUBS.has(suggestion.subCategory),
    suggested: true,
  };
}

/** The app's read-only chip: uppercase, tracked, on a card. */
function ReadPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </span>
  );
}

function layeringFor(category: Category) {
  if (category === "outerwear") return "outerwear" as const;
  if (category === "footwear") return "footwear" as const;
  if (category === "one_piece") return "standalone" as const;
  return "base_layer" as const;
}

export function AddItemDialog() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [stage, setStage] = useState<"pick" | "tag" | "saving">("pick");
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [savingIndex, setSavingIndex] = useState(0);
  const [last, setLast] = useState<LastPick | null>(null);

  // Matches how the theme store is read elsewhere in the app: an external
  // store rather than state synced from an effect.
  const vision = useSyncExternalStore(
    subscribeVisionStatus,
    getVisionStatus,
    getServerVisionStatus,
  );

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => setLast(loadLast()), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const reset = useCallback(() => {
    setPending((prev) => { prev.forEach((p) => URL.revokeObjectURL(p.preview_url)); return []; });
    setDrafts((prev) => { prev.forEach((d) => URL.revokeObjectURL(d.preview_url)); return []; });
    setStage("pick");
    setError(null);
    setDragging(false);
    setSavingIndex(0);
    dragDepth.current = 0;
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
  }, []);

  function addFiles(files: FileList | null) {
    const images = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) { setError("No images found. Pick JPEG, PNG, WebP or HEIC."); return; }
    setError(null);
    const next: PendingFile[] = images.map((file) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file, preview_url: URL.createObjectURL(file) }));
    setPending((prev) => [...prev, ...next]);
  }

  function removePending(id: string) {
    setPending((prev) => { const f = prev.find((p) => p.id === id); if (f) URL.revokeObjectURL(f.preview_url); return prev.filter((p) => p.id !== id); });
  }

  function handleDone() {
    if (pending.length === 0) { setError("Add at least one photo first."); return; }
    // Seasons start from what was picked last time, or empty. Guessing from a
    // hardcoded temperature, as this used to, was never better than asking.
    const next = pending.map((p) => makeDraft(p, last ?? undefined));
    setDrafts(next);
    setStage("tag");
    analyseAll(next);
  }

  /**
   * Reads each photo in the background.
   *
   * The File is passed down explicitly rather than looked up inside a state
   * updater — an updater may run more than once or be deferred, and reading
   * the work item from inside one is how the previous on-device feature ended
   * up with drafts stuck mid-analysis forever.
   *
   * Sequential on purpose: several inferences at once is how a mid-range phone
   * stutters, and the user is reading the first card anyway.
   */
  function analyseAll(list: Draft[]) {
    void (async () => {
      for (const draft of list) {
        patchDraft(draft.id, { analysis: "running" });
        const reading = await readGarment(draft.file);

        if (!reading) {
          patchDraft(draft.id, { analysis: "skipped" });
          continue;
        }

        const entry = reading.analysis.category?.value ?? null;
        setDrafts((prev) =>
          prev.map((d) => {
            if (d.id !== draft.id) return d;
            const withColor: Draft = {
              ...d,
              analysis: "done",
              reading: reading.analysis,
              primary_color: reading.primaryColor ?? d.primary_color,
              secondary_colors: reading.secondaryColors,
              color_lch: reading.colorLch,
            };
            // A category the user already chose outranks the model's.
            if (!entry || d.suggested) return withColor;
            return withSuggestion(withColor, suggestionFor(reading.analysis, entry));
          }),
        );
      }
    })();
  }

  /**
   * A manual category change.
   *
   * The photo has not changed, so the readings stay — except a sleeve length,
   * which stops meaning anything the moment the garment becomes a shoe.
   *
   * Seasons re-derive from the new garment type, so picking "Parka" by hand is
   * as good as the model picking it. That is what keeps seasons something the
   * user never has to think about: whoever names the garment, the seasons
   * follow from it.
   */
  function applyManualCategory(id: string, category: Category, sub: string) {
    const hasSleeves = category === "top" || category === "one_piece" || category === "outerwear";
    const entry = CATEGORY_ENTRIES.find((e) => e.category === category && e.sub_category === sub);
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const sleeve_length = hasSleeves ? d.sleeve_length : null;
        return {
          ...d,
          category,
          sub_category: sub,
          rain_ready: RAIN_READY_SUBS.has(sub),
          sleeve_length,
          seasons:
            d.seasonsTouched || !entry
              ? d.seasons
              : deriveSeasons({
                  base: entry.seasons,
                  category,
                  sleeveLength: sleeve_length,
                  apparentWeight: d.apparent_weight,
                  warmth: d.warmth,
                  layeringRole: entry.layering_role,
                }),
        };
      }),
    );
  }

  /** The user picking a type the model was unsure about. Re-resolves the
   *  attributes and seasons for what they chose, with no second inference. */
  function chooseSuggestion(id: string, entryId: string) {
    const entry = CATEGORY_ENTRIES.find((e) => e.id === entryId);
    if (!entry) return;
    setDrafts((prev) =>
      prev.map((d) => (d.id === id && d.reading ? withSuggestion(d, suggestionFor(d.reading, entry)) : d)),
    );
  }

  function patchDraft(id: string, update: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...update } : d)));
  }

  function removeDraft(id: string) {
    setDrafts((prev) => { const f = prev.find((d) => d.id === id); if (f) URL.revokeObjectURL(f.preview_url); const n = prev.filter((d) => d.id !== id); if (n.length === 0) { setStage("pick"); setPending([]); } return n; });
  }

  function toggleSeason(id: string, season: Season) {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const next = d.seasons.includes(season)
          ? d.seasons.filter((s) => s !== season)
          : SEASONS.filter((s) => s === season || d.seasons.includes(s));
        saveLast(d.category, d.sub_category, next);
        return { ...d, seasons: next, seasonsTouched: true };
      }),
    );
  }

  function applySeasonToAll(season: Season) {
    setDrafts((prev) => prev.map((d) => ({ ...d, seasons: [season], seasonsTouched: true })));
  }

  function applyRainToAll() {
    // One control, so make it a toggle over the whole batch rather than a
    // one-way switch the user cannot take back.
    setDrafts((prev) => {
      const allOn = prev.every((d) => d.rain_ready);
      return prev.map((d) => ({ ...d, rain_ready: !allOn }));
    });
  }

  async function handleSaveAll() {
    for (const d of drafts) {
      if (d.seasons.length === 0) { setError("Pick at least one season for each item."); return; }
    }
    setStage("saving");
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session expired. Sign in again.");
      for (let i = 0; i < drafts.length; i++) {
        setSavingIndex(i);
        const d = drafts[i];
        const name = d.item_name.trim() || `${d.sub_category} #${i + 1}`;
        const compressed = await toCompressedFile(d.file);
        const ext = compressed.type === "image/avif" ? "avif" : compressed.type === "image/webp" ? "webp" : "jpg";
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const upload = await supabase.storage.from(BUCKET).upload(path, compressed, { contentType: compressed.type, upsert: false });
        if (upload.error) throw new Error(upload.error.message);
        const result = await saveItem({
          image_url: path,
          item_name: name,
          category: d.category,
          sub_category: d.sub_category || d.category,
          primary_color: d.primary_color,
          secondary_colors: d.secondary_colors,
          color_l: d.color_lch?.l ?? null,
          color_c: d.color_lch?.c ?? null,
          color_h: d.color_lch?.h ?? null,
          formality: d.formality,
          seasons: d.seasons,
          rain_ready: d.rain_ready,
          sleeve_length: d.sleeve_length,
          apparent_weight: d.apparent_weight,
          warmth: d.warmth,
          occasions: [],
          wear_notes: "",
          layering_role: layeringFor(d.category),
        });
        if (!result.ok) throw new Error(result.error);
        saveLast(d.category, d.sub_category, d.seasons);
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setStage("tag");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Started here rather than in an effect so it is plainly a consequence
        // of the user opening the dialog. Fire-and-forget: it never blocks the
        // form, and failure is handled by the status store.
        if (next) void preloadVisionModel();
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="hidden md:inline-flex"><Plus />Add items</Button>
      </DialogTrigger>
      <DialogTrigger asChild>
        <button type="button" className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 md:hidden">
          <Plus className="size-6" /><span className="sr-only">Add items</span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[92dvh] sm:max-w-2xl" onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <DialogTitle>{stage === "pick" ? "Add garments" : `Tag · ${drafts.length} item${drafts.length > 1 ? "s" : ""}`}</DialogTitle>
          <DialogDescription>{stage === "pick" ? "Bulk drop or camera — tag with one tap." : "Pick the seasons each piece suits. Name is optional."}</DialogDescription>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
          {stage === "pick" && (
            <div className="flex flex-col gap-4">
              <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
              <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addFiles(e.target.files)} />
              <div
                onDragEnter={(e) => { if (!e.dataTransfer.types.includes("Files")) return; dragDepth.current += 1; setDragging(true); }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false); }}
                onDrop={(e) => { e.preventDefault(); dragDepth.current = 0; setDragging(false); addFiles(e.dataTransfer.files); }}
                className={cn("flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center", dragging ? "border-primary bg-accent" : "border-border hover:bg-accent/40")}
              >
                <div className={cn("flex size-14 items-center justify-center rounded-full", dragging ? "bg-primary/10" : "bg-muted")}><ImageUp className={cn("size-6", dragging ? "text-foreground" : "text-muted-foreground")} /></div>
                <div><p className="text-sm font-medium">{dragging ? "Drop to add" : "Drop photos here"}</p><p className="text-xs text-muted-foreground">bulk supported · remembers last picks</p></div>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}><ImageUp />Gallery</Button>
                  <Button type="button" size="sm" onClick={() => cameraInput.current?.click()}><Camera />Take photo</Button>
                </div>
              </div>

              {pending.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between"><p className="text-sm font-medium">{pending.length} ready</p><Button variant="ghost" size="sm" onClick={() => { pending.forEach((p) => URL.revokeObjectURL(p.preview_url)); setPending([]); }}>Clear</Button></div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {pending.map((p) => (
                      <div key={p.id} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.preview_url} alt="" className="size-full object-cover" />
                        <button type="button" onClick={() => removePending(p.id)} className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"><X className="size-3.5" /></button>
                      </div>
                    ))}
                  </div>
                  <Button onClick={handleDone} className="w-full">Done · Tag {pending.length} item{pending.length > 1 ? "s" : ""} in 1 tap each</Button>
                  <p className="text-center text-xs text-muted-foreground">Tip: last category & season auto-applied — just tap season if needed.</p>
                </div>
              )}
              {error && <p className="text-center text-sm text-destructive">{error}</p>}
            </div>
          )}

          {stage === "tag" && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
                <span className="text-xs font-medium">All:</span>
                {SEASONS.map((s) => (
                  <button key={s} type="button" onClick={() => applySeasonToAll(s)} className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent active:scale-95">{SEASON_LABELS[s]} → all</button>
                ))}
                <button type="button" onClick={applyRainToAll} className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent active:scale-95">
                  <Droplets className="size-3.5 text-rainy" />Rain-ready → all
                </button>
                <span className="ml-auto text-[11px] text-muted-foreground">1 tap fills all</span>
              </div>

              {vision.state !== "ready" && (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {vision.state === "loading" ? (
                    <>
                      <Loader2 className="size-3.5 shrink-0 animate-spin" />
                      Downloading the 45&nbsp;MB photo analyser{vision.progress > 0 ? ` — ${vision.progress}%` : ""}. One
                      time, then it&rsquo;s cached. Tag away meanwhile.
                    </>
                  ) : vision.state === "unavailable" ? (
                    <>Automatic tagging isn&rsquo;t available on this device — tag by hand below.</>
                  ) : null}
                </p>
              )}

              {drafts.map((d) => (
                <div key={d.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:p-4">
                  <div className="flex gap-3">
                    <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border bg-muted sm:size-24">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.preview_url} alt="" className="size-full object-cover" />
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Label htmlFor={`name-${d.id}`} className="text-xs">Name <span className="font-normal text-muted-foreground">(optional)</span></Label>
                      <Input id={`name-${d.id}`} value={d.item_name} placeholder={`${d.sub_category} #`} onChange={(e) => patchDraft(d.id, { item_name: e.target.value })} className="h-9" />
                      <Button variant="ghost" size="sm" className="h-7 self-start px-2 text-xs" onClick={() => removeDraft(d.id)}><Trash2 className="size-3.5" />Remove</Button>
                    </div>
                  </div>

                  {d.analysis === "running" && (
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Reading the photo&hellip;
                    </p>
                  )}

                  {/* Uncertain is a real answer, so it asks instead of picking
                      the least-bad option. */}
                  {d.analysis === "done" && d.reading && !d.suggested && d.reading.categoryOptions.length > 0 && (
                    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-2.5">
                      <p className="text-[11px] text-muted-foreground">
                        Not sure what this is. Which is it?
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {d.reading.categoryOptions.map((o) => (
                          <button
                            key={o.value.id}
                            type="button"
                            onClick={() => chooseSuggestion(d.id, o.value.id)}
                            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent active:scale-95"
                          >
                            {o.value.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* What was read off the photo. Read-only: the editable
                      controls for all of it are directly below. */}
                  {d.analysis === "done" && (d.suggested || d.primary_color !== "unknown") && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {d.suggested && (
                        <ReadPill>
                          <Sparkles className="size-3 text-clay-ink" />
                          From the photo
                        </ReadPill>
                      )}
                      {d.sleeve_length && <ReadPill>{SLEEVE_LABELS[d.sleeve_length]}</ReadPill>}
                      {d.apparent_weight && <ReadPill>{WEIGHT_LABELS[d.apparent_weight]}</ReadPill>}
                      {d.warmth && <ReadPill>{WARMTH_LABELS[d.warmth]}</ReadPill>}
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">
                      Colour{" "}
                      <span className="font-normal normal-case tracking-normal text-muted-foreground">
                        {d.primary_color === "unknown" ? "not detected" : "tap to correct"}
                      </span>
                    </Label>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {COLOR_NAMES.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() =>
                            patchDraft(d.id, {
                              primary_color: name,
                              // Correcting the name retires the measurement:
                              // otherwise the engine goes on scoring the
                              // pixels this tap just overruled.
                              color_lch: null,
                            })
                          }
                          className={cn(
                            "shrink-0 rounded-full border px-3 py-1.5 text-xs capitalize",
                            d.primary_color === name
                              ? "border-primary bg-primary text-primary-foreground"
                              : "bg-card hover:bg-accent",
                          )}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Dress code</Label>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {FORMALITIES.map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => patchDraft(d.id, { formality: f })}
                          className={cn(
                            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
                            d.formality === f
                              ? "border-primary bg-primary text-primary-foreground"
                              : "bg-card hover:bg-accent",
                          )}
                        >
                          {FORMALITY_LABELS[f]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Category</Label>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {CATEGORIES.map((c) => (
                        <button key={c} type="button" onClick={() => applyManualCategory(d.id, c, SUB_CATEGORIES[c][0])} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium", d.category === c ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>{CATEGORY_LABELS[c]}</button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Type</Label>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {SUB_CATEGORIES[d.category].map((s) => (
                        <button key={s} type="button" onClick={() => applyManualCategory(d.id, d.category, s)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs capitalize", d.sub_category === s ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>{s}</button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">
                      Seasons <span className="text-destructive">*</span>{" "}
                      <span className="font-normal normal-case tracking-normal text-muted-foreground">pick any that fit</span>
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {SEASONS.map((s) => {
                        const on = d.seasons.includes(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleSeason(d.id, s)}
                            className={cn("rounded-xl border p-2.5 text-left active:scale-[0.98]", on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}
                          >
                            <p className="text-sm font-medium">{SEASON_LABELS[s]}</p>
                            <p className={cn("text-xs", on ? "text-primary-foreground/80" : "text-muted-foreground")}>{SEASON_DESC[s]}</p>
                          </button>
                        );
                      })}
                    </div>
                    {/* Below the grid, not inside it — a fifth tile here would
                        read as a fifth season. */}
                    <button
                      type="button"
                      aria-pressed={d.rain_ready}
                      onClick={() => patchDraft(d.id, { rain_ready: !d.rain_ready })}
                      className={cn(
                        "mt-0.5 inline-flex h-9 w-fit items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition active:scale-95",
                        d.rain_ready
                          ? "border-primary bg-primary font-medium text-primary-foreground"
                          : "border-border bg-card hover:bg-accent",
                      )}
                    >
                      <Droplets className={cn("size-3.5", d.rain_ready ? "text-primary-foreground" : "text-rainy")} />
                      Rain-ready
                      <span className={cn("text-[11px]", d.rain_ready ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        optional
                      </span>
                    </button>
                  </div>
                </div>
              ))}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}

          {stage === "saving" && (
            <div className="flex flex-col items-center gap-3 py-12"><Loader2 className="size-7 animate-spin" /><p className="text-sm text-muted-foreground">Saving {savingIndex + 1} of {drafts.length}…</p></div>
          )}
        </div>

        {stage === "tag" && (
          <div className="flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
            <Button variant="ghost" onClick={() => setStage("pick")}>Back</Button>
            <Button onClick={handleSaveAll}>Save {drafts.length} to wardrobe</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
