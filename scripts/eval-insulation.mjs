/**
 * Checks weather judgement against the complaint that prompted it.
 *
 *   npm run eval:insulation
 *
 * Every garment below is a real row from the wardrobe this was reported on,
 * copied with its stored attributes. The report was: at 21C (70F) the app
 * offered a t-shirt, jeans, sneakers and a cap with the same confidence as a
 * sweatshirt, and put a sleeveless vest and sunglasses on the same morning.
 *
 * Run this before touching the outfit engine. If these do not hold, the engine
 * has nothing worth being wired to.
 */

import {
  coverageOf,
  coveragePenalty,
  insulationOf,
  needsSun,
  targetInsulation,
} from "@/lib/insulation.ts";

let failures = 0;

function check(label, actual, predicate, expectation) {
  const ok = predicate(actual);
  if (!ok) failures++;
  const shown = typeof actual === "number" ? actual.toFixed(1) : String(actual);
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label.padEnd(48)} ${shown.padStart(6)}   ${expectation}`,
  );
}

const g = (category, layering_role, sleeve_length, apparent_weight, warmth) => ({
  category,
  layering_role,
  sleeve_length,
  apparent_weight,
  warmth,
});

// The real rows, verbatim from wardrobe_items.
const tee = g("top", "base_layer", "short", "medium", "low");
const vest = g("top", "base_layer", "sleeveless", "medium", "low");
const polo = g("top", "base_layer", "long", "medium", "medium");
const sweatshirt = g("top", "base_layer", "long", "medium", "medium");
const jacket = g("outerwear", "outerwear", "long", "heavy", "medium");
const jeans = g("bottom", "base_layer", null, "light", "low");
const sneakers = g("footwear", "footwear", null, "medium", "low");
const cap = g("accessory", "standalone", null, "medium", "low");
// Predates the reader: no attributes at all.
const legacyTop = g("top", "base_layer", null, null, null);

console.log("\nPer-garment insulation");
console.log("-".repeat(92));
check("sleeveless vest", insulationOf(vest), (v) => v === 0, "bare arms, nothing over them");
check("t-shirt", insulationOf(tee), (v) => v === 2, "the 80F anchor");
check("long-sleeve polo", insulationOf(polo), (v) => v === 6, "the 70F anchor");
check("sweatshirt", insulationOf(sweatshirt), (v) => v === 6, "same as the polo, correctly");
check("heavy jacket", insulationOf(jacket), (v) => v > 12, "a winter layer, not a spring one");
check("jeans contribute nothing", insulationOf(jeans), (v) => v === 0, "torso only, by design");
check("unread top is null", String(insulationOf(legacyTop)), (v) => v === "null",
  "never guessed as zero");

console.log("\nWhat each temperature asks for");
console.log("-".repeat(92));
check("95F", targetInsulation(95), (v) => v === 0, "nothing helps");
check("80F", targetInsulation(80), (v) => v >= 1 && v <= 2.5, "a t-shirt");
check("70F", targetInsulation(70), (v) => v >= 4 && v <= 5, "covered arms or a light layer");
check("50F", targetInsulation(50), (v) => v >= 11 && v <= 14, "a sweatshirt under a light layer");
check("40F", targetInsulation(40), (v) => v >= 16 && v <= 18.5, "a sweatshirt under a real jacket");
check("30F", targetInsulation(30), (v) => v >= 15, "a real coat");
check("50F with 20mph wind", targetInsulation(50, 20),
  (v) => v > targetInsulation(50), "wind strips the still-air layer");
check("80F with 20mph wind", targetInsulation(80, 20),
  (v) => v === targetInsulation(80), "a warm breeze asks for nothing");

const at = (t, items, wind = 0) => coverageOf(items, t, wind);

console.log("\nThe reported complaint, at 70F (21C)");
console.log("-".repeat(92));
const teeLook = at(70, [tee, jeans, sneakers, cap]);
check("tee + jeans + sneakers + cap is under-dressed", teeLook.gap,
  () => teeLook.under, "THE REPORT: this used to score as a perfect fit");
check("  and loses points for it", coveragePenalty(teeLook), (v) => v > 0, "not merely noted");
check("sleeveless vest alone is under-dressed", at(70, [vest, jeans]).gap,
  () => at(70, [vest, jeans]).under, "THE REPORT: bare arms on a cool morning");
check("vest is judged worse than the tee",
  coveragePenalty(at(70, [vest, jeans])) - coveragePenalty(teeLook),
  (v) => v > 0, "less coverage, larger penalty");
check("sweatshirt alone is right", at(70, [sweatshirt, jeans]).gap,
  () => !at(70, [sweatshirt, jeans]).under && !at(70, [sweatshirt, jeans]).over,
  "what the report asked for instead");
check("long-sleeve polo alone is right", at(70, [polo, jeans]).gap,
  () => !at(70, [polo, jeans]).under && !at(70, [polo, jeans]).over, "likewise");
check("tee + vest still under-dressed", at(70, [tee, vest, jeans]).gap,
  () => at(70, [tee, vest, jeans]).under, "two thin things are not one warm thing");
check("tee + heavy jacket is too warm", at(70, [tee, jacket, jeans]).gap,
  () => at(70, [tee, jacket, jeans]).over, "their only jacket is a winter jacket");

console.log("\nThe same wardrobe across the year");
console.log("-".repeat(92));
check("tee alone at 85F is right", at(85, [tee, jeans]).gap,
  () => !at(85, [tee, jeans]).under && !at(85, [tee, jeans]).over, "summer");
check("vest alone at 90F is right", at(90, [vest, jeans]).gap,
  () => !at(90, [vest, jeans]).under, "what a sleeveless vest is for");
check("sweatshirt alone at 40F is under", at(40, [sweatshirt, jeans]).gap,
  () => at(40, [sweatshirt, jeans]).under, "needs the jacket");
check("sweatshirt + jacket at 40F is right", at(40, [sweatshirt, jacket, jeans]).gap,
  () => !at(40, [sweatshirt, jacket, jeans]).under &&
        !at(40, [sweatshirt, jacket, jeans]).over, "layering earns its place");
check("sweatshirt + jacket at 75F is too warm", at(75, [sweatshirt, jacket, jeans]).gap,
  () => at(75, [sweatshirt, jacket, jeans]).over, "and is not free");

console.log("\nHonesty about what was never measured");
console.log("-".repeat(92));
check("a look with an unread top is unjudged", String(at(70, [legacyTop, jeans])),
  (v) => v === "null", "silence beats a confident guess");
check("a look with no torso piece is unjudged", String(at(70, [jeans, sneakers])),
  (v) => v === "null", "nothing to weigh");

console.log("\nThe sky, not the thermometer");
console.log("-".repeat(92));
check("sunglasses need sun", needsSun({ sub_category: "sunglasses" }),
  (v) => v === true, "THE REPORT: offered on a cool overcast morning");
check("a cap does not", needsSun({ sub_category: "cap" }), (v) => v === false, "worn regardless");
check("a null sub_category does not", needsSun({ sub_category: null }),
  (v) => v === false, "never guess");

console.log(
  `\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
