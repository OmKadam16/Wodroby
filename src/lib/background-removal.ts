"use client";

/**
 * Clothing background removal with BiRefNet-Lite on WebGPU.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------
 * This is *segmentation*, not image generation. BiRefNet's only job is to say
 * which pixels belong to the garment. Every pixel in the output is copied from
 * the user's original photograph — colour, texture, pattern, logos, stitching,
 * buttons and zips are never recomputed, redrawn or "improved". The model
 * produces an alpha mask; the mask decides what is kept, and nothing else.
 *
 * The pipeline:
 *
 *   original photo
 *        -> squish-resize to 1024x1024, ImageNet-normalised  (model input)
 *        -> BiRefNet-Lite, WebGPU                            (inference)
 *        -> sigmoid(logits) = soft alpha, 1024x1024          (mask)
 *        -> alpha scaled back to the photo's own resolution
 *        -> ORIGINAL pixels x alpha                          (extraction)
 *        -> bounding box, padding, centring
 *        -> composite over white                             (the card)
 *
 * ---------------------------------------------------------------------------
 * HOW THE MODEL IS LOADED
 * ---------------------------------------------------------------------------
 * The weights (~123 MB, fp16) come from the Hugging Face repo once and are
 * then kept in the Cache Storage API, so later visits and later photos reuse
 * the local copy. The InferenceSession itself is a module-level singleton —
 * building it is expensive, so it is created on first use and reused for every
 * subsequent image rather than per-photo.
 *
 * The ONNX Runtime WASM binaries are served from our own /ort/ directory (see
 * scripts/copy-ort-assets.mjs) rather than a CDN, so the CSP does not need to
 * trust a third-party script host.
 *
 * ---------------------------------------------------------------------------
 * WHEN WEBGPU IS NOT AVAILABLE
 * ---------------------------------------------------------------------------
 * `isSupported()` reports whether this browser can run the model at all. The
 * caller is expected to check it and simply skip background removal, keeping
 * the photo exactly as taken — the app stays fully usable without it.
 *
 * A CPU path would slot in at `EXECUTION_PROVIDERS` below, but note that this
 * particular checkpoint is a fp16 WebGPU build; a WASM fallback needs an fp32
 * export of the same model, not this file.
 */

import type { InferenceSession, Tensor } from "onnxruntime-web";

const MODEL_URL =
  "https://huggingface.co/runes/birefnet-lite-webgpu/resolve/main/birefnet_lite_webgpu_fp16.onnx";

/** Cache Storage bucket holding the downloaded weights. */
const MODEL_CACHE = "wordroby-birefnet-v1";

/** Fixed by the checkpoint: input_image [1,3,1024,1024]. */
const SIZE = 1024;
const INPUT_NAME = "input_image";
const OUTPUT_NAME = "output_image";

/** The checkpoint was trained with standard ImageNet normalisation. */
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

const EXECUTION_PROVIDERS = ["webgpu"] as const;

/** Roughly the download size, for telling the user what they are in for. */
export const MODEL_BYTES = 123_224_205;

export type Progress = {
  stage: "downloading" | "preparing" | "analysing" | "compositing";
  /** 0..1 while downloading, otherwise undefined. */
  ratio?: number;
};

export type RemovalResult = {
  /** The garment's original pixels composited onto a white card. */
  card: Blob;
  /** Fraction of the frame the garment occupies — tiny values mean a bad cut. */
  coverage: number;
  width: number;
  height: number;
};

/**
 * True when this browser can run the model. Cheap, safe to call on render.
 *
 * Checks the *value*, not just the key: some browsers define `navigator.gpu`
 * as undefined behind a disabled flag, and `"gpu" in navigator` would then
 * wrongly report support.
 */
export function isSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { gpu?: unknown }).gpu != null
  );
}

/** True once the weights are in Cache Storage, so no download is needed. */
export async function isModelCached(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const cache = await caches.open(MODEL_CACHE);
    return Boolean(await cache.match(MODEL_URL));
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Model loading                                                              */
/* -------------------------------------------------------------------------- */

let sessionPromise: Promise<InferenceSession> | null = null;

/**
 * Fetch the weights, preferring the local cache. Reports download progress by
 * reading the response stream, because a 123 MB download needs a progress bar
 * rather than a spinner.
 */
async function loadModelBytes(onProgress?: (p: Progress) => void) {
  const cache =
    typeof caches !== "undefined" ? await caches.open(MODEL_CACHE) : null;

  const hit = await cache?.match(MODEL_URL);
  if (hit) return await hit.arrayBuffer();

  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Could not download the model (${response.status}).`);
  }

  const total = Number(response.headers.get("content-length")) || MODEL_BYTES;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.({ stage: "downloading", ratio: Math.min(received / total, 1) });
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  // Store for next time. A failure here is not fatal — it just means the
  // next visit downloads again.
  try {
    await cache?.put(
      MODEL_URL,
      new Response(bytes, {
        headers: { "content-type": "application/octet-stream" },
      }),
    );
  } catch {
    /* Cache full or unavailable; carry on with the bytes we have. */
  }

  return bytes.buffer as ArrayBuffer;
}

/**
 * Build the inference session once and share it. ONNX Runtime is imported
 * dynamically so its ~1 MB of JavaScript never lands in the main bundle for
 * users who do not add a garment.
 */
function getSession(onProgress?: (p: Progress) => void) {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import("onnxruntime-web/webgpu");

      // Serve the WASM binaries from our own origin, and stay single-threaded:
      // the page is not cross-origin isolated, so SharedArrayBuffer (and hence
      // ORT's threaded backend) is unavailable anyway.
      ort.env.wasm.wasmPaths = "/ort/";
      ort.env.wasm.numThreads = 1;

      const bytes = await loadModelBytes(onProgress);
      onProgress?.({ stage: "preparing" });

      return await ort.InferenceSession.create(bytes, {
        executionProviders: [...EXECUTION_PROVIDERS],
        graphOptimizationLevel: "all",
      });
    })().catch((err) => {
      // Let the next attempt retry from scratch rather than caching a failure.
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}

/** Download and compile now, so the first photo is not the slow one. */
export async function warmUp(onProgress?: (p: Progress) => void) {
  await getSession(onProgress);
}

/* -------------------------------------------------------------------------- */
/* Pre- and post-processing                                                   */
/* -------------------------------------------------------------------------- */

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser cannot process the image.");
  return { canvas, ctx };
}

/**
 * Build the model input: the photo squished (not letterboxed) to 1024x1024,
 * converted to planar CHW float32 and ImageNet-normalised. Squishing is what
 * the checkpoint expects; the mask is un-squished again afterwards, so the
 * distortion never reaches the output.
 */
function toInputTensor(source: ImageBitmap, ort: typeof import("onnxruntime-web")) {
  const { ctx } = canvasOf(SIZE, SIZE);
  ctx.drawImage(source, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

  const plane = SIZE * SIZE;
  const chw = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const p = i * 4;
    chw[i] = (data[p] / 255 - MEAN[0]) / STD[0];
    chw[plane + i] = (data[p + 1] / 255 - MEAN[1]) / STD[1];
    chw[2 * plane + i] = (data[p + 2] / 255 - MEAN[2]) / STD[2];
  }
  return new ort.Tensor("float32", chw, [1, 3, SIZE, SIZE]);
}

/**
 * Turn the raw logits into an 8-bit alpha mask.
 *
 * The mask is kept SOFT rather than thresholded to black and white: hair-fine
 * edges, lace, frills and loose fabric only survive if partial coverage
 * survives. The gentle curve below pushes the very low and very high ends
 * apart, which clears faint background haze and firms up the garment's
 * interior without hardening the edge into a jagged cut.
 */
function toAlphaMask(logits: Float32Array) {
  const alpha = new Uint8ClampedArray(SIZE * SIZE);
  for (let i = 0; i < alpha.length; i++) {
    const a = 1 / (1 + Math.exp(-logits[i]));
    // smoothstep over [0.04, 0.96] — monotonic, so ordering is preserved.
    const t = Math.min(Math.max((a - 0.04) / 0.92, 0), 1);
    alpha[i] = Math.round(t * t * (3 - 2 * t) * 255);
  }
  return alpha;
}

/* -------------------------------------------------------------------------- */
/* The public entry point                                                     */
/* -------------------------------------------------------------------------- */

export type RemovalOptions = {
  /** Side of the square output card, in pixels. */
  cardSize?: number;
  /** Margin around the garment, as a fraction of the card. */
  padding?: number;
  onProgress?: (p: Progress) => void;
  /** Output encoding. WebP keeps the card small without visible loss. */
  type?: string;
  quality?: number;
};

/**
 * Cut the garment out of `file` and return it centred on a white card.
 *
 * Throws if WebGPU is missing or inference fails, so the caller can fall back
 * to the untouched photo.
 */
export async function removeClothingBackground(
  file: Blob,
  {
    cardSize = 1024,
    padding = 0.08,
    onProgress,
    type = "image/webp",
    quality = 0.92,
  }: RemovalOptions = {},
): Promise<RemovalResult> {
  if (!isSupported()) {
    throw new Error("This browser cannot run background removal (no WebGPU).");
  }

  const ort = await import("onnxruntime-web/webgpu");
  const session = await getSession(onProgress);

  const bitmap = await createImageBitmap(file);
  onProgress?.({ stage: "analysing" });

  // ---- inference -------------------------------------------------------
  let logits: Float32Array;
  try {
    const feeds: Record<string, Tensor> = {
      [INPUT_NAME]: toInputTensor(bitmap, ort),
    };
    const output = await session.run(feeds);
    logits = output[OUTPUT_NAME].data as Float32Array;
  } finally {
    // Freed explicitly: these are full-resolution photos and several may be
    // processed back to back.
    bitmapClose(bitmap, false);
  }

  onProgress?.({ stage: "compositing" });

  const alpha = toAlphaMask(logits);

  // ---- put the mask back on the photo's own grid ------------------------
  // The mask is 1024x1024 because the input was squished to fit; scaling it
  // back to the photo's real dimensions is what keeps the garment's true
  // proportions. The browser's own bilinear scaling does this smoothly, which
  // also avoids the stair-stepped edges a nearest-neighbour resize would give.
  const maskSmall = canvasOf(SIZE, SIZE);
  const maskImage = maskSmall.ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < alpha.length; i++) {
    const p = i * 4;
    maskImage.data[p] = maskImage.data[p + 1] = maskImage.data[p + 2] = 255;
    maskImage.data[p + 3] = alpha[i];
  }
  maskSmall.ctx.putImageData(maskImage, 0, 0);

  const full = await createImageBitmap(file);
  const w = full.width;
  const h = full.height;

  // ---- extraction: ORIGINAL pixels, masked -----------------------------
  // The photo is drawn at its native size and then clipped by the mask with
  // 'destination-in'. Nothing repaints the garment: the surviving pixels are
  // byte-for-byte the ones the camera recorded, with only their alpha changed.
  const cut = canvasOf(w, h);
  cut.ctx.drawImage(full, 0, 0);
  cut.ctx.globalCompositeOperation = "destination-in";
  cut.ctx.drawImage(maskSmall.canvas, 0, 0, w, h);
  cut.ctx.globalCompositeOperation = "source-over";
  bitmapClose(full, true);

  // ---- bounding box of what survived ------------------------------------
  const cutData = cut.ctx.getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let solid = 0;
  // Ignore the faintest fringe when measuring bounds, or a few stray haze
  // pixels in a corner would blow the box up to the whole frame.
  const EDGE = 24;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (cutData[(y * w + x) * 4 + 3] > EDGE) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        solid++;
      }
    }
  }

  if (maxX < 0) {
    throw new Error("No clothing was found in that photo.");
  }

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;

  // ---- the white card ---------------------------------------------------
  // Square card, garment scaled to fit inside the padding with its aspect
  // ratio intact, then centred. White is painted first and the cut-out is
  // drawn over it, so semi-transparent edge pixels blend to white rather than
  // to whatever was behind them.
  const card = canvasOf(cardSize, cardSize);
  card.ctx.fillStyle = "#ffffff";
  card.ctx.fillRect(0, 0, cardSize, cardSize);

  const inner = cardSize * (1 - padding * 2);
  const scale = Math.min(inner / boxW, inner / boxH);
  const drawW = boxW * scale;
  const drawH = boxH * scale;

  card.ctx.imageSmoothingEnabled = true;
  card.ctx.imageSmoothingQuality = "high";
  card.ctx.drawImage(
    cut.canvas,
    minX,
    minY,
    boxW,
    boxH,
    (cardSize - drawW) / 2,
    (cardSize - drawH) / 2,
    drawW,
    drawH,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    card.canvas.toBlob(resolve, type, quality),
  );
  if (!blob) throw new Error("Could not encode the processed image.");

  return { card: blob, coverage: solid / (w * h), width: cardSize, height: cardSize };
}

/** ImageBitmap.close() is not in every browser; never let it break the run. */
function bitmapClose(bitmap: ImageBitmap, ignore: boolean) {
  try {
    bitmap.close();
  } catch {
    if (!ignore) {
      /* nothing to do — closing is an optimisation, not a requirement */
    }
  }
}
