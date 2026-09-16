"use client";

import { decodeTable, type EmbeddingTable } from "@/lib/vision/classify";

/**
 * Loads and runs MobileCLIP2-S0's vision encoder in the browser.
 *
 * The photo never leaves the device. The only thing fetched from the network
 * is the model itself, from the Hugging Face CDN, and Transformers.js keeps it
 * in the Cache Storage API afterwards — so the 45 MB is paid once per browser,
 * not once per visit.
 *
 * Everything here is best-effort. If WebGPU is missing, it falls back to WASM;
 * if that fails too, or the network is unavailable, the status becomes
 * "unavailable" and the add-item flow carries on exactly as it did before.
 * Analysis is a convenience layered on top of a form that already works.
 */

const MODEL_ID = "plhery/mobileclip2-onnx";
/** Relative to the repo's `onnx/` folder, which Transformers.js prepends. */
const VISION_MODEL_FILE = "s0/vision_model";

/** Longest edge fed to the processor. It crops to 256 anyway, so decoding a
 *  12-megapixel phone photo at full size only costs memory on the device least
 *  able to spare it. */
const PRESCALE_EDGE = 512;

export type VisionStatus =
  | { state: "idle" }
  | { state: "loading"; progress: number }
  | { state: "ready" }
  | { state: "unavailable" };

/* One shared object, not a fresh one per call: useSyncExternalStore compares
   snapshots by identity, and a new object each time is an infinite re-render. */
const IDLE: VisionStatus = { state: "idle" };

let status: VisionStatus = IDLE;
const listeners = new Set<() => void>();

function setStatus(next: VisionStatus) {
  status = next;
  for (const listener of listeners) listener();
}

export function subscribeVisionStatus(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVisionStatus(): VisionStatus {
  return status;
}

/** The server never has a model. Must be referentially stable — see IDLE. */
export function getServerVisionStatus(): VisionStatus {
  return IDLE;
}

type Loaded = {
  model: { (inputs: Record<string, unknown>): Promise<{ image_embeds: { data: Float32Array } }> };
  processor: (images: unknown[]) => Promise<{ pixel_values: unknown }>;
  table: EmbeddingTable;
  RawImage: new (data: Uint8ClampedArray, width: number, height: number, channels: number) => unknown;
};

/** One load per tab, shared by every image. */
let loading: Promise<Loaded | null> | null = null;

function webGpuAvailable(): boolean {
  // `"gpu" in navigator` is true even where the value is undefined, which is
  // how the previous on-device feature managed to claim support it did not have.
  if (typeof navigator === "undefined") return false;
  return (navigator as Navigator & { gpu?: unknown }).gpu != null;
}

async function load(): Promise<Loaded | null> {
  try {
    setStatus({ state: "loading", progress: 0 });

    // Imported here, never at module scope: the package is large, and a static
    // import would put it in the page bundle for everyone, including visitors
    // who never open the add dialog.
    const [{ AutoProcessor, CLIPVisionModelWithProjection, RawImage, env }, tableJson] =
      await Promise.all([
        import("@huggingface/transformers"),
        import("@/lib/vision/text-embeddings.json"),
      ]);

    // There are no models served from this origin; without this the loader
    // spends a round trip finding that out.
    env.allowLocalModels = false;

    const progress = (event: { status?: string; progress?: number }) => {
      if (event.status === "progress" && typeof event.progress === "number") {
        setStatus({ state: "loading", progress: Math.min(99, Math.round(event.progress)) });
      }
    };

    const options = { model_file_name: VISION_MODEL_FILE, progress_callback: progress } as const;
    let model;
    try {
      model = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
        ...options,
        device: webGpuAvailable() ? "webgpu" : "wasm",
        dtype: "fp32",
      });
    } catch {
      // A browser can advertise WebGPU and still fail to produce an adapter.
      model = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
        ...options,
        device: "wasm",
        dtype: "fp32",
      });
    }

    const processor = await AutoProcessor.from_pretrained(MODEL_ID);

    setStatus({ state: "ready" });
    return {
      model: model as unknown as Loaded["model"],
      processor: ((images: unknown[]) =>
        (processor as unknown as (i: unknown[]) => Promise<{ pixel_values: unknown }>)(
          images,
        )) as Loaded["processor"],
      table: decodeTable(
        (tableJson as { default?: Parameters<typeof decodeTable>[0] }).default ??
          (tableJson as unknown as Parameters<typeof decodeTable>[0]),
      ),
      RawImage: RawImage as unknown as Loaded["RawImage"],
    };
  } catch (error) {
    // The UI deliberately says nothing beyond "not available on this device",
    // because there is nothing the user can do about it. The reason still
    // belongs in the console — without it, every failure looks identical.
    console.warn("[wardroby] Photo analysis unavailable:", error);
    setStatus({ state: "unavailable" });
    return null;
  }
}

/** Safe to call repeatedly; only the first call does any work. */
export function preloadVisionModel(): Promise<Loaded | null> {
  loading ??= load();
  return loading;
}

/**
 * Decodes the photo to raw pixels at a bounded size.
 *
 * Goes straight from ImageBitmap to pixel data — no intermediate PNG — so a
 * phone photo is decoded once and resized once. The file itself is never
 * altered; this is a throwaway copy that exists only to be measured.
 */
async function toPixels(
  file: File,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const source = await createImageBitmap(file);
  const longest = Math.max(source.width, source.height);
  const scale = longest > PRESCALE_EDGE ? PRESCALE_EDGE / longest : 1;
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable.");
  context.drawImage(source, 0, 0, width, height);
  source.close();

  const { data } = context.getImageData(0, 0, width, height);
  return { data, width, height };
}

/**
 * Returns the L2-normalised image embedding, or null when the model could not
 * be loaded or the image could not be read.
 */
export async function embedImage(file: File): Promise<Float32Array | null> {
  const loaded = await preloadVisionModel();
  if (!loaded) return null;

  try {
    const { data, width, height } = await toPixels(file);
    const image = new loaded.RawImage(data, width, height, 4);
    const { pixel_values } = await loaded.processor([image]);
    const { image_embeds } = await loaded.model({ pixel_values });

    const raw = image_embeds.data;
    let sum = 0;
    for (const value of raw) sum += value * value;
    const norm = Math.sqrt(sum) || 1;
    return Float32Array.from(raw, (value) => value / norm);
  } catch {
    return null;
  }
}


/** The embedding table, once the model is loaded. */
export async function getEmbeddingTable(): Promise<EmbeddingTable | null> {
  const loaded = await preloadVisionModel();
  return loaded?.table ?? null;
}
