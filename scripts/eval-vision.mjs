/**
 * Measures the classifier against a labelled folder of photos.
 *
 * Prompt wording is guesswork without this: a phrasing that reads better to a
 * human often scores worse, and the only way to know is to run it. Point it at
 * a directory containing the images plus a `labels.json` of
 * `{ "file.jpg": { "accept": ["entry_id", ...] } }`.
 *
 * Usage:  npm run eval:vision -- path/to/folder
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";
import { classifyEmbedding, decodeTable, THRESHOLDS } from "@/lib/vision/classify";

const dir = process.argv[2];
if (!dir || !existsSync(join(dir, "labels.json"))) {
  console.error("Usage: npm run eval:vision -- <folder containing labels.json>");
  process.exit(1);
}

const labels = JSON.parse(readFileSync(join(dir, "labels.json"), "utf8"));
const table = decodeTable(JSON.parse(readFileSync("src/lib/vision/text-embeddings.json", "utf8")));

const model = await CLIPVisionModelWithProjection.from_pretrained("plhery/mobileclip2-onnx", {
  model_file_name: "s0/vision_model",
  device: "cpu",
  dtype: "fp32",
});
const processor = await AutoProcessor.from_pretrained("plhery/mobileclip2-onnx");

const pct = (n) => `${(n * 100).toFixed(0)}%`.padStart(4);
let correct = 0;
let confidentlyCorrect = 0;
let confidentlyWrong = 0;
let abstained = 0;
const rows = [];

for (const [file, { accept }] of Object.entries(labels)) {
  const path = join(dir, file);
  if (!existsSync(path)) {
    console.error(`missing: ${file}`);
    continue;
  }
  const inputs = await processor([await RawImage.read(path)]);
  const { image_embeds } = await model({ pixel_values: inputs.pixel_values });
  const raw = image_embeds.data;
  let sum = 0;
  for (const v of raw) sum += v * v;
  const embedding = Float32Array.from(raw, (v) => v / (Math.sqrt(sum) || 1));

  const a = classifyEmbedding(embedding, table);
  const top = a.categoryOptions[0];
  const topOk = top ? accept.includes(top.value.id) : false;
  if (topOk) correct++;

  // The three outcomes that matter: a confident right answer, a confident
  // wrong answer (the expensive kind — it lands in the user's wardrobe), and
  // an abstention (cheap — the user is asked).
  let verdict;
  if (a.category) {
    if (accept.includes(a.category.value.id)) { confidentlyCorrect++; verdict = "OK   "; }
    else { confidentlyWrong++; verdict = "WRONG"; }
  } else { abstained++; verdict = "ask  "; }

  rows.push(
    `${verdict} ${file.padEnd(22)} ${(top?.value.id ?? "-").padEnd(14)}` +
    `${pct(top?.confidence ?? 0)}  want:${accept.join("|").padEnd(18)}` +
    `| ${a.categoryOptions.slice(0, 3).map((o) => `${o.value.id} ${pct(o.confidence)}`).join("  ")}`,
  );
}

const n = rows.length;
console.log(rows.join("\n"));
console.log(`\ntop-1 correct        ${correct}/${n}  (${pct(correct / n)})`);
console.log(`confidently correct  ${confidentlyCorrect}/${n}  (${pct(confidentlyCorrect / n)})`);
console.log(`CONFIDENTLY WRONG    ${confidentlyWrong}/${n}  <- the ones that reach the wardrobe`);
console.log(`abstained (asks)     ${abstained}/${n}`);
console.log(`thresholds ${JSON.stringify(THRESHOLDS)}`);
