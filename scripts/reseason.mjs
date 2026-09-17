/**
 * Recomputes seasons for items the vision model has read.
 *
 *   ... | npm run reseason           prints a before/after table
 *   ... | npm run reseason -- --sql  also emits the UPDATE statements
 *
 * Takes the rows as JSON on stdin and writes nothing itself. That is
 * deliberate: it keeps the script free of any credential, makes the change
 * reviewable as plain SQL before anything is committed, and lets the same
 * tool run against a query result from any source.
 *
 *   select id, item_name, category, seasons, min_temp_f, max_temp_f,
 *          sleeve_length, apparent_weight, warmth, layering_role
 *   from wardrobe_items;
 *
 * Why it exists: `deriveSeasons` used to only ever *remove* seasons from a
 * starting set, so a garment reading "medium weight, medium warmth" kept all
 * four and was stored with a 15 to 105 range. `isWearable` never excludes such
 * an item and `degreesOutside` returns 0 for it at any temperature, so it is
 * invisible to the forecast. Half this wardrobe landed that way.
 *
 * Only rows carrying at least one measured attribute are touched. Rows with
 * none predate the reader: migration 0005 derived their seasons *from* their
 * original temperature range, and re-deriving would overwrite real information
 * with a guess.
 */

import { deriveSeasons, seasonsToTempRange } from "@/lib/seasons.ts";

/*
 * Tried and rejected: clamping each row to the seasons its garment type
 * declares in the classifier's vocabulary.
 *
 * It fixed the case it was written for, a pair of shorts stored as all-year,
 * and broke three others. The vocabulary calls a vest a fall and winter layer,
 * meaning a padded gilet, so a sleeveless low-warmth vest was cut to fall
 * alone; a long-sleeve polo lost winter the same way. The type default is a
 * prior for a garment nothing is known about, and an item carrying measured
 * attributes has better evidence than its category does. Clamping lets the
 * weaker evidence overrule the stronger one.
 */

const EMIT_SQL = process.argv.includes("--sql");

const raw = await new Promise((resolve, reject) => {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (buffer += chunk));
  process.stdin.on("end", () => resolve(buffer));
  process.stdin.on("error", reject);
});

let items;
try {
  items = JSON.parse(raw);
} catch {
  console.error("Expected a JSON array of wardrobe_items rows on stdin.");
  process.exit(1);
}
if (!Array.isArray(items)) {
  console.error("Expected a JSON array.");
  process.exit(1);
}

const same = (a, b) => a.length === b.length && a.every((v) => b.includes(v));
const changes = [];
let skipped = 0;
let unchanged = 0;

for (const item of items) {
  const analysed =
    item.sleeve_length !== null ||
    item.apparent_weight !== null ||
    item.warmth !== null;
  if (!analysed) {
    skipped++;
    continue;
  }

  const next = deriveSeasons({
    // Start from what the row already claims, so a season chosen by hand is
    // narrowed by the evidence rather than thrown away by a default.
    base: item.seasons ?? [],
    category: item.category,
    sleeveLength: item.sleeve_length,
    apparentWeight: item.apparent_weight,
    warmth: item.warmth,
    layeringRole: item.layering_role,
  });

  if (same(next, item.seasons ?? [])) {
    unchanged++;
    continue;
  }
  const { min, max } = seasonsToTempRange(next);
  changes.push({ item, next, min, max });
}

const order = ["spring", "summer", "fall", "winter"];
const fmt = (seasons) =>
  order.filter((s) => seasons.includes(s)).map((s) => s.slice(0, 2)).join(" ") ||
  "none";

console.error(
  `\n${items.length} items: ${changes.length} to change, ${unchanged} already correct, ` +
    `${skipped} skipped as pre-reader rows.\n`,
);

if (changes.length > 0) {
  console.error(
    "item".padEnd(34) + "sleeve/weight/warmth".padEnd(26) + "before".padEnd(22) + "after",
  );
  console.error("-".repeat(104));
  for (const { item, next, min, max } of changes) {
    const attrs = [item.sleeve_length, item.apparent_weight, item.warmth]
      .map((v) => v ?? "-")
      .join("/");
    console.error(
      item.item_name.slice(0, 32).padEnd(34) +
        attrs.padEnd(26) +
        `${fmt(item.seasons ?? [])} ${item.min_temp_f}-${item.max_temp_f}`.padEnd(22) +
        `${fmt(next)} ${min}-${max}`,
    );
  }
}

if (EMIT_SQL && changes.length > 0) {
  console.error("\n-- SQL below on stdout --\n");
  for (const { item, next, min, max } of changes) {
    const arr = next.map((s) => `'${s}'`).join(",");
    console.log(
      `update wardrobe_items set seasons = array[${arr}]::text[], ` +
        `min_temp_f = ${min}, max_temp_f = ${max} where id = '${item.id}';`,
    );
  }
} else if (!EMIT_SQL) {
  console.error("Dry run. Re-run with --sql to emit the UPDATE statements.\n");
}
