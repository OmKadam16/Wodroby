/**
 * Precomputes the text side of MobileCLIP2-S0.
 *
 * The S0 text encoder is 254 MB — five times the vision encoder — and the
 * vocabulary it would be asked about never changes at runtime. So it runs once,
 * here, on a developer machine, and the browser only ever ships the resulting
 * table of vectors.
 *
 * Each label is embedded as several sentences and averaged into a single unit
 * vector, so the runtime table is one row per label and classification is a
 * single matrix multiply against the image embedding.
 *
 * Run with:  npm run build:text-embeddings
 * Re-run whenever anything in src/lib/vision/prompts.ts changes.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { AutoTokenizer, CLIPTextModelWithProjection, Tensor } from "@huggingface/transformers";
import { buildPromptGroups } from "../src/lib/vision/prompts.ts";

const MODEL_ID = "plhery/mobileclip2-onnx";
/* Relative to the repo's `onnx/` folder, which Transformers.js prepends itself
   — the model card's example path double-prefixes it and 404s on v4. */
const TEXT_MODEL_FILE = "s0/text_model";
/** OpenCLIP's fixed context length. MobileCLIP inherits it. */
const CONTEXT_LENGTH = 77;
const EOT_TOKEN_ID = 49407;

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../src/lib/vision/text-embeddings.json");

/**
 * Tokenises the OpenCLIP way: [SOT, ...tokens, EOT, 0, 0, ...].
 *
 * The repo's tokenizer.json pads with the EOT id rather than zero, and the
 * exported encoder pools at the position of the *last* maximal id — so EOT
 * padding moves the pooled vector to the end of the sequence and the output is
 * very nearly noise. Measured on sample photos: zero padding ranks 6 of 6
 * garments correctly with a clear margin, EOT padding ranks at chance. So the
 * padding is rewritten here rather than trusted.
 */
function encode(tokenizer, prompt) {
  const encoded = tokenizer([prompt], {
    padding: "max_length",
    max_length: CONTEXT_LENGTH,
    truncation: true,
  });
  const ids = Array.from(encoded.input_ids.data, Number);
  const eot = ids.indexOf(EOT_TOKEN_ID);
  const padded = ids.map((id, i) => (eot !== -1 && i > eot ? 0 : id));
  return new Tensor("int64", BigInt64Array.from(padded, BigInt), [1, CONTEXT_LENGTH]);
}

function l2normalize(vector) {
  let sum = 0;
  for (const v of vector) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  return vector.map((v) => v / norm);
}

console.log(`Loading ${MODEL_ID} (${TEXT_MODEL_FILE}) — the first run downloads ~254 MB.`);
const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
const model = await CLIPTextModelWithProjection.from_pretrained(MODEL_ID, {
  model_file_name: TEXT_MODEL_FILE,
  device: "cpu",
  dtype: "fp32",
});

const groups = buildPromptGroups();
const promptCount = groups.reduce((n, g) => n + g.prompts.length, 0);
console.log(`Embedding ${promptCount} prompts across ${groups.length} labels.`);

const ids = [];
const rows = [];
let dim = 0;

for (const group of groups) {
  let mean = null;
  for (const prompt of group.prompts) {
    const { text_embeds } = await model({ input_ids: encode(tokenizer, prompt) });
    const width = text_embeds.dims[1];
    dim ||= width;
    if (width !== dim) throw new Error(`Inconsistent embedding width: ${width} vs ${dim}`);
    mean ??= new Float64Array(dim);
    // Normalise each sentence before averaging, so a long prompt with a large
    // magnitude does not dominate the label it shares with shorter ones.
    const unit = l2normalize(Array.from(text_embeds.data));
    for (let j = 0; j < dim; j++) mean[j] += unit[j];
  }
  const vector = l2normalize(Array.from(mean, (v) => v / group.prompts.length));

  ids.push(group.id);
  rows.push(vector);
  process.stdout.write(".");
}
process.stdout.write("\n");

const flat = new Float32Array(ids.length * dim);
rows.forEach((row, i) => flat.set(row, i * dim));

writeFileSync(
  OUT,
  JSON.stringify({
    model: MODEL_ID,
    model_file: TEXT_MODEL_FILE,
    dim,
    ids,
    // Base64 of a little-endian Float32Array, row-major, one unit vector per
    // id. JSON numbers would be three times the size for no benefit.
    data: Buffer.from(flat.buffer).toString("base64"),
  }),
);

console.log(`Wrote ${ids.length} x ${dim} embeddings to ${OUT}`);
