/**
 * Runs the real classifier over image files, on the CPU, and prints what it
 * decided. The tool for tuning THRESHOLDS in src/lib/vision/classify.ts — the
 * numbers there are only meaningful against actual photographs.
 *
 * Usage:  npm run classify -- path/to/photo.jpg [more.jpg ...]
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";
import { classifyEmbedding, decodeTable, THRESHOLDS } from "@/lib/vision/classify";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("Usage: npm run classify -- <image> [image ...]");
  process.exit(1);
}

const table = decodeTable(JSON.parse(readFileSync("src/lib/vision/text-embeddings.json", "utf8")));

console.log("Loading the vision encoder (the first run downloads ~45 MB)…");
const model = await CLIPVisionModelWithProjection.from_pretrained("plhery/mobileclip2-onnx", {
  model_file_name: "s0/vision_model",
  device: "cpu",
  dtype: "fp32",
});
const processor = await AutoProcessor.from_pretrained("plhery/mobileclip2-onnx");

const pct = (n) => `${(n * 100).toFixed(1)}%`;

for (const path of paths) {
  const image = await RawImage.read(path);
  const inputs = await processor([image]);
  const started = Date.now();
  const { image_embeds } = await model({ pixel_values: inputs.pixel_values });
  const elapsed = Date.now() - started;

  const raw = image_embeds.data;
  let sum = 0;
  for (const v of raw) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  const embedding = Float32Array.from(raw, (v) => v / norm);

  const a = classifyEmbedding(embedding, table);
  console.log(`\n=== ${basename(path)}  (${elapsed}ms, CPU) ===`);
  console.log("  top 3:  ", a.categoryOptions.map((o) => `${o.value.label} ${pct(o.confidence)}`).join("   "));
  console.log(
    "  verdict:",
    a.category
      ? `${a.category.value.label}  ->  ${a.category.value.category}/${a.category.value.sub_category}`
      : "UNCERTAIN - ask the user",
  );
  console.log("  attrs:  ", JSON.stringify({
    sleeve: a.sleeveLength, weight: a.apparentWeight, warmth: a.warmth, formality: a.formality,
  }));
}

console.log("\nthresholds:", JSON.stringify(THRESHOLDS));
