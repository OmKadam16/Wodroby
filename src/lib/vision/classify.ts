import {
  CATEGORY_ENTRIES,
  FORMALITY_OPTIONS,
  SLEEVE_OPTIONS,
  WARMTH_OPTIONS,
  WEIGHT_OPTIONS,
  type CategoryEntry,
} from "@/lib/vision/prompts";
import type {
  ApparentWeight,
  Formality,
  SleeveLength,
  WarmthLevel,
} from "@/types/wardrobe";

/**
 * Turns an image embedding into wardrobe metadata.
 *
 * Every group is scored independently — the model is asked "which of these
 * four sleeve lengths?", not "describe this garment" — and each answer has to
 * clear a confidence bar on its own. Anything that does not clear it comes back
 * null, which is stored as null and shown as "unknown". A garment the model
 * cannot read is a normal outcome, not a failure to paper over.
 */

/**
 * Starting points, tuned by hand against sample photos. They are the whole
 * accuracy/silence trade-off, so they live together and nowhere else.
 */
export const THRESHOLDS = {
  /** CLIP's own logit scale. Text embeddings sit in a narrow cone, so raw
   *  cosines cluster near 1 and only look decisive once scaled. */
  logitScale: 100,
  /** Top category must reach this share of the probability mass... */
  categoryTop1: 0.3,
  /** ...and beat the runner-up by this much, so "shirt vs blouse" asks rather
   *  than picking a coin-flip winner. */
  categoryMargin: 0.08,
  /** Attributes are a harder read than category, so they are held higher. */
  attribute: 0.45,
};

export type EmbeddingTable = {
  dim: number;
  ids: string[];
  /** Row-major, one L2-normalised vector per id. */
  data: Float32Array;
};

export type TableJson = { dim: number; ids: string[]; data: string };

export function decodeTable(json: TableJson): EmbeddingTable {
  const binary = atob(json.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { dim: json.dim, ids: json.ids, data: new Float32Array(bytes.buffer) };
}

export type Scored<T> = { value: T; confidence: number };

export type ClothingAnalysis = {
  /** null when nothing cleared the bar — the caller should ask instead. */
  category: Scored<CategoryEntry> | null;
  /** Always populated, best first. Offered to the user when category is null. */
  categoryOptions: Scored<CategoryEntry>[];
  sleeveLength: SleeveLength | null;
  apparentWeight: ApparentWeight | null;
  warmth: WarmthLevel | null;
  formality: Formality | null;
};

function softmaxOverGroup(
  image: Float32Array,
  table: EmbeddingTable,
  prefix: string,
): { key: string; confidence: number }[] {
  const logits: { key: string; logit: number }[] = [];
  for (let row = 0; row < table.ids.length; row++) {
    const id = table.ids[row];
    if (!id.startsWith(prefix)) continue;
    let dot = 0;
    const offset = row * table.dim;
    for (let i = 0; i < table.dim; i++) dot += image[i] * table.data[offset + i];
    logits.push({ key: id.slice(prefix.length), logit: dot * THRESHOLDS.logitScale });
  }

  const max = Math.max(...logits.map((l) => l.logit));
  let sum = 0;
  const exps = logits.map((l) => {
    const e = Math.exp(l.logit - max);
    sum += e;
    return e;
  });

  return logits
    .map((l, i) => ({ key: l.key, confidence: exps[i] / sum }))
    .sort((a, b) => b.confidence - a.confidence);
}

function pickAttribute<T extends string>(
  image: Float32Array,
  table: EmbeddingTable,
  group: string,
  allowed: readonly { value: T }[],
): T | null {
  const ranked = softmaxOverGroup(image, table, `${group}:`);
  const top = ranked[0];
  if (!top || top.confidence < THRESHOLDS.attribute) return null;
  return allowed.some((o) => o.value === top.key) ? (top.key as T) : null;
}

/**
 * Drops attributes that cannot mean anything for the identified garment.
 *
 * The attribute groups are scored independently of category, so a photo of
 * shoes still gets a sleeve length — and it is always nonsense. Left in, it
 * would feed the season rules as though it were a real reading.
 *
 * Called once the category is settled, whether the model chose it or the user
 * did.
 */
export function attributesForCategory(
  analysis: ClothingAnalysis,
  entry: CategoryEntry,
): {
  sleeveLength: SleeveLength | null;
  apparentWeight: ApparentWeight | null;
  warmth: WarmthLevel | null;
  formality: Formality | null;
} {
  const hasSleeves =
    entry.category === "top" ||
    entry.category === "one_piece" ||
    entry.category === "outerwear";
  return {
    sleeveLength: hasSleeves ? analysis.sleeveLength : null,
    apparentWeight: analysis.apparentWeight,
    warmth: analysis.warmth,
    formality: analysis.formality,
  };
}

/** The image embedding must already be L2-normalised. */
export function classifyEmbedding(
  image: Float32Array,
  table: EmbeddingTable,
): ClothingAnalysis {
  const ranked = softmaxOverGroup(image, table, "category:");
  const byId = new Map(CATEGORY_ENTRIES.map((e) => [e.id, e]));

  const options: Scored<CategoryEntry>[] = [];
  for (const r of ranked) {
    const entry = byId.get(r.key);
    if (entry) options.push({ value: entry, confidence: r.confidence });
  }

  const [first, second] = options;
  const confident =
    first !== undefined &&
    first.confidence >= THRESHOLDS.categoryTop1 &&
    first.confidence - (second?.confidence ?? 0) >= THRESHOLDS.categoryMargin;

  return {
    category: confident ? first : null,
    categoryOptions: options.slice(0, 3),
    sleeveLength: pickAttribute(image, table, "sleeve_length", SLEEVE_OPTIONS),
    apparentWeight: pickAttribute(image, table, "apparent_weight", WEIGHT_OPTIONS),
    warmth: pickAttribute(image, table, "warmth", WARMTH_OPTIONS),
    formality: pickAttribute(image, table, "formality", FORMALITY_OPTIONS),
  };
}
