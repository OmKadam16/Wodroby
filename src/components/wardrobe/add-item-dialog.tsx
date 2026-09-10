"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImageUp, Loader2, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toCompressedFile } from "@/lib/image";
import { BUCKET } from "@/lib/storage";
import { saveItem } from "@/app/wardrobe/actions";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  SUB_CATEGORIES,
  type Category,
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

type SeasonId = "summer" | "winter" | "rainy" | "all";

const SEASONS: {
  id: SeasonId;
  label: string;
  desc: string;
  conditions: string[];
  min: number;
  max: number;
}[] = [
  { id: "summer", label: "Summer", desc: "Hot & sunny", conditions: ["sunny", "hot", "humid"], min: 68, max: 105 },
  { id: "winter", label: "Winter", desc: "Cold & snowy", conditions: ["cold", "snowy", "cloudy"], min: 15, max: 55 },
  { id: "rainy", label: "Rainy", desc: "Wet & cloudy", conditions: ["rainy", "cloudy"], min: 45, max: 75 },
  { id: "all", label: "All Season", desc: "Year round", conditions: ["sunny", "cloudy"], min: 30, max: 90 },
];

type PendingFile = { id: string; file: File; preview_url: string };
type Draft = {
  id: string;
  file: File;
  preview_url: string;
  item_name: string;
  category: Category;
  sub_category: string;
  season: SeasonId | null;
};

const LAST_KEY = "wardroby_last_add";

function loadLast(): { category: Category; sub: string; season: SeasonId } | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p.category && p.season) return p;
  } catch {}
  return null;
}

function saveLast(category: Category, sub: string, season: SeasonId) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ category, sub, season }));
  } catch {}
}

function makeDraft(p: PendingFile, fallback?: { category: Category; sub: string; season: SeasonId | null }): Draft {
  const cat = fallback?.category ?? "top";
  const sub = fallback?.sub ?? SUB_CATEGORIES[cat][0];
  return {
    id: p.id,
    file: p.file,
    preview_url: p.preview_url,
    item_name: "",
    category: cat,
    sub_category: sub,
    season: fallback?.season ?? null,
  };
}

function seasonToWeather(season: SeasonId | null) {
  if (!season) return { min: 30, max: 90, conditions: ["sunny", "cloudy"] };
  const c = SEASONS.find((s) => s.id === season)!;
  return { min: c.min, max: c.max, conditions: c.conditions };
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
  const [last, setLast] = useState<{ category: Category; sub: string; season: SeasonId } | null>(null);

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
    const fb = last ? { category: last.category, sub: last.sub, season: last.season } : undefined;
    const autoSeason = fb?.season ?? null;
    if (!autoSeason) {
      try {
        const wTemp = 75;
        const inferred: SeasonId = wTemp >= 68 ? "summer" : wTemp <= 55 ? "winter" : "all";
        setDrafts(pending.map((p) => makeDraft(p, { category: fb?.category ?? "top", sub: fb?.sub ?? SUB_CATEGORIES[fb?.category ?? "top"][0], season: inferred })));
      } catch { setDrafts(pending.map((p) => makeDraft(p, fb))); }
    } else {
      setDrafts(pending.map((p) => makeDraft(p, fb)));
    }
    setStage("tag");
  }

  function patchDraft(id: string, update: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...update } : d)));
  }

  function removeDraft(id: string) {
    setDrafts((prev) => { const f = prev.find((d) => d.id === id); if (f) URL.revokeObjectURL(f.preview_url); const n = prev.filter((d) => d.id !== id); if (n.length === 0) { setStage("pick"); setPending([]); } return n; });
  }

  function applySeasonToAll(season: SeasonId) {
    setDrafts((prev) => prev.map((d) => ({ ...d, season })));
  }

  async function handleSaveAll() {
    for (const d of drafts) {
      if (!d.season) { setError("Tap a season for each item — one tap is enough."); return; }
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
        const weather = seasonToWeather(d.season);
        const result = await saveItem({
          image_url: path,
          item_name: name,
          category: d.category,
          sub_category: d.sub_category || d.category,
          primary_color: "unknown",
          secondary_colors: [],
          formality: "casual",
          min_temp_f: weather.min,
          max_temp_f: weather.max,
          suitable_conditions: weather.conditions,
          occasions: [],
          wear_notes: "",
          layering_role: d.category === "outerwear" ? "outerwear" : d.category === "footwear" ? "footwear" : d.category === "one_piece" ? "standalone" : "base_layer",
        });
        if (!result.ok) throw new Error(result.error);
        if (d.season) saveLast(d.category, d.sub_category, d.season);
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
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button className="hidden sm:inline-flex"><Plus />Add items</Button>
      </DialogTrigger>
      <DialogTrigger asChild>
        <button type="button" className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 sm:hidden">
          <Plus className="size-6" /><span className="sr-only">Add items</span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[92vh] sm:max-w-2xl" onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <DialogTitle>{stage === "pick" ? "Add garments" : `Tag · ${drafts.length} item${drafts.length > 1 ? "s" : ""}`}</DialogTitle>
          <DialogDescription>{stage === "pick" ? "Bulk drop or camera — tag with one tap." : "One season tap per photo is enough. Name is optional."}</DialogDescription>
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
                  <button key={s.id} type="button" onClick={() => applySeasonToAll(s.id)} className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent active:scale-95">{s.label} → all</button>
                ))}
                <span className="ml-auto text-[11px] text-muted-foreground">1 tap fills all</span>
              </div>

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

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Category</Label>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {CATEGORIES.map((c) => (
                        <button key={c} type="button" onClick={() => patchDraft(d.id, { category: c, sub_category: SUB_CATEGORIES[c][0] })} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium", d.category === c ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>{CATEGORY_LABELS[c]}</button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Type</Label>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {SUB_CATEGORIES[d.category].map((s) => (
                        <button key={s} type="button" onClick={() => patchDraft(d.id, { sub_category: s })} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs capitalize", d.sub_category === s ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>{s}</button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Season <span className="text-destructive">*</span></Label>
                    <div className="grid grid-cols-2 gap-2">
                      {SEASONS.map((s) => (
                        <button key={s.id} type="button" onClick={() => { patchDraft(d.id, { season: s.id }); saveLast(d.category, d.sub_category, s.id); }} className={cn("rounded-xl border p-2.5 text-left active:scale-[0.98]", d.season === s.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>
                          <p className="text-sm font-medium">{s.label}</p><p className={cn("text-xs", d.season === s.id ? "text-primary-foreground/80" : "text-muted-foreground")}>{s.desc}</p>
                        </button>
                      ))}
                    </div>
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
