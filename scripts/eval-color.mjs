/**
 * Checks colour judgement against the cases that motivated rewriting it.
 *
 *   npm run eval:color
 *
 * Every expectation below is a real combination from the wardrobe or the
 * request that prompted the change, not a synthetic one. Run it before
 * touching the outfit engine: if these do not hold, the engine has nothing
 * worth being wired to.
 */

import {
  PALETTE,
  colorOf,
  harmony,
  isNeutral,
  lchForName,
} from "@/lib/color-harmony.ts";

let failures = 0;

function check(label, actual, predicate, expectation) {
  const ok = predicate(actual);
  if (!ok) failures++;
  const shown = typeof actual === "number" ? actual.toFixed(2) : String(actual);
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label.padEnd(46)} ${shown.padStart(6)}   ${expectation}`,
  );
}

const item = (primary_color) => ({ primary_color });

console.log("\nNeutrality, measured rather than listed");
console.log("-".repeat(86));
for (const name of ["olive", "brown", "navy", "charcoal", "beige", "cream", "denim"]) {
  const lch = lchForName(name);
  check(`${name} is neutral`, lch.c, () => isNeutral(lch), "below its hue family's chroma tolerance");
}
for (const name of ["red", "orange", "pink", "purple", "teal", "yellow"]) {
  const lch = lchForName(name);
  check(`${name} is an accent`, lch.c, () => !isNeutral(lch), "reads as a statement colour");
}

console.log("\nFree text from rows written before coordinates were kept");
console.log("-".repeat(86));
check("'olive green' resolves to olive", lchForName("olive green")?.h ?? NaN,
  (h) => Math.abs(h - lchForName("olive").h) < 1, "olive, not green");
check("'olive green' is neutral", lchForName("olive green")?.c ?? NaN,
  () => isNeutral(lchForName("olive green")), "the regression that started this");
check("'dark brown' is neutral", lchForName("dark brown")?.c ?? NaN,
  () => isNeutral(lchForName("dark brown")), "brown, one step darker");
check("'navy blue' resolves to navy", lchForName("navy blue")?.h ?? NaN,
  (h) => Math.abs(h - lchForName("navy").h) < 1, "navy wins over blue");
check("'light blue' is an accent", lchForName("light blue")?.c ?? NaN,
  () => !isNeutral(lchForName("light blue")), "a real colour, lighter");
check("'unknown' resolves to nothing", String(lchForName("unknown")),
  (v) => v === "null", "a failed reading is not a colour");
check("gibberish resolves to nothing", String(lchForName("zzzz")),
  (v) => v === "null", "never guess");

console.log("\nHarmony");
console.log("-".repeat(86));
const cases = [
  ["light blue + orange + red", ["light blue", "orange", "red"], (s) => s <= 0.2, "the case in the request"],
  ["navy + white + brown", ["navy", "white", "brown"], (s) => s >= 0.7, "all neutral, always safe"],
  ["pink + grey + black", ["pink", "grey", "black"], (s) => s >= 0.9, "one statement colour"],
  ["olive green + dark brown + beige", ["olive green", "dark brown", "beige"], (s) => s >= 0.7, "scored 0.2 before this change"],
  ["unknown + grey + black", ["unknown", "grey", "black"], (s) => s >= 0.7, "null never counts as an accent"],
  ["red + orange + beige", ["red", "orange", "beige"], (s) => s >= 0.7, "neighbours on the wheel"],
  ["teal + red + white", ["teal", "red", "white"], (s) => s >= 0.7, "opposite the wheel"],
  ["orange + purple + grey", ["orange", "purple", "grey"], (s) => s <= 0.45, "the band where colours argue"],
];
for (const [label, names, predicate, expectation] of cases) {
  const { score, note } = harmony(names.map(item));
  check(label, score, predicate, expectation);
  if (note) console.log(`${" ".repeat(8)}note: ${note}`);
}

console.log("\nMeasured coordinates beat the name");
console.log("-".repeat(86));
const measured = { primary_color: "red", color_l: 0.5, color_c: 0.01, color_h: 20 };
check("stored low chroma wins over the name 'red'", colorOf(measured).c,
  () => isNeutral(colorOf(measured)), "a hand-typed name is not the last word");
const named = { primary_color: "red", color_l: null, color_c: null, color_h: null };
check("cleared coordinates fall back to the name", colorOf(named).c,
  () => !isNeutral(colorOf(named)), "correcting by hand must win");

console.log("\nEvery palette entry resolves");
console.log("-".repeat(86));
const unresolved = PALETTE.filter((entry) => lchForName(entry.name) === null);
check("all palette names resolve", unresolved.length, (n) => n === 0, "no gaps in the vocabulary");

console.log(
  `\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
