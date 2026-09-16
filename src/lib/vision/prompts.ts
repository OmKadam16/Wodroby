import type {
  ApparentWeight,
  Category,
  Formality,
  LayeringRole,
  Season,
  SleeveLength,
  WarmthLevel,
} from "@/types/wardrobe";

/**
 * The controlled vocabulary the vision model is asked about.
 *
 * This is the only place garment wording lives. Everything downstream — the
 * precompute script, the classifier, the UI — reads it from here, so the list
 * can be tuned without touching anything else.
 *
 * Changing ANY string in this file invalidates `text-embeddings.json`. Re-run
 * `npm run build:text-embeddings` afterwards, or the vectors will no longer
 * correspond to the labels they are indexed by.
 */

// ------------------------------------------------------------------
// Templates
// ------------------------------------------------------------------

/** CLIP is sensitive to phrasing, so each label is scored as the average of
 *  several sentences rather than one. */
const CATEGORY_TEMPLATES = [
  "a photo of {}",
  "a product photo of {}",
  "a close-up photo of {}",
  "this clothing item is {}",
  "this garment is {}",
];

const ATTRIBUTE_TEMPLATES = ["a photo of {}", "{}"];

// ------------------------------------------------------------------
// Garments
// ------------------------------------------------------------------

export type CategoryEntry = {
  /** Stable key. Also the row key in the embedding table. */
  id: string;
  label: string;
  category: Category;
  sub_category: string;
  /**
   * Taken from the garment, not asked of the model. Whether a cardigan is a
   * mid layer is a fact about cardigans; putting it in a prompt would only add
   * a way to get it wrong.
   */
  layering_role: LayeringRole;
  /**
   * The seasons this kind of garment is worn in, before anything is read off
   * the photo. A parka is not a summer coat no matter how it was shot, and no
   * attribute the model can see should be able to make it one.
   *
   * Attributes then narrow this — see deriveSeasons in src/lib/seasons.ts.
   */
  seasons: Season[];
  /**
   * Synonyms are averaged into one vector, so "pants" and "trousers" do not
   * split the score between two near-identical classes.
   *
   * Worth writing these as things you can SEE. "a cap" and "a hat" are almost
   * the same sentence to CLIP; "a baseball cap with a curved peak" and "a
   * wide-brimmed sun hat" are not.
   */
  phrasings: string[];
};

export const CATEGORY_ENTRIES: CategoryEntry[] = [
  // --- tops ---
  { id: "t_shirt", label: "T-shirt", category: "top", sub_category: "t-shirt", layering_role: "base_layer", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["a t-shirt", "a short sleeve cotton tee shirt with a plain crew neck"] },
  { id: "tank", label: "Tank top", category: "top", sub_category: "tank", layering_role: "base_layer", seasons: ["summer"], phrasings: ["a tank top", "a sleeveless top with bare shoulders and armholes cut to the chest"] },
  { id: "shirt", label: "Shirt", category: "top", sub_category: "shirt", layering_role: "base_layer", seasons: ["spring", "summer", "fall"], phrasings: ["a button-up shirt", "a collared shirt with a row of buttons down the front"] },
  { id: "polo", label: "Polo shirt", category: "top", sub_category: "polo", layering_role: "base_layer", seasons: ["spring", "summer", "fall"], phrasings: ["a polo shirt", "a knit shirt with a soft fold-down collar and a short two-button placket"] },
  { id: "blouse", label: "Blouse", category: "top", sub_category: "blouse", layering_role: "base_layer", seasons: ["spring", "summer", "fall"], phrasings: ["a blouse", "a light flowing women's blouse in thin drapey fabric"] },
  { id: "sweater", label: "Sweater", category: "top", sub_category: "sweater", layering_role: "mid_layer", seasons: ["fall", "winter"], phrasings: ["a knitted sweater", "a wool jumper with a visible knit texture and ribbed cuffs"] },
  { id: "hoodie", label: "Hoodie", category: "top", sub_category: "hoodie", layering_role: "mid_layer", seasons: ["spring", "fall", "winter"], phrasings: ["a hoodie", "a hooded sweatshirt with a drawstring hood and a front kangaroo pocket"] },
  { id: "sweatshirt", label: "Sweatshirt", category: "top", sub_category: "sweatshirt", layering_role: "mid_layer", seasons: ["spring", "fall", "winter"], phrasings: ["a crewneck sweatshirt", "a plain fleece sweatshirt with ribbed cuffs and no hood"] },
  { id: "crop_top", label: "Crop top", category: "top", sub_category: "crop top", layering_role: "base_layer", seasons: ["summer"], phrasings: ["a crop top", "a short top cut to end above the waist, leaving the midriff bare"] },
  { id: "tunic", label: "Tunic", category: "top", sub_category: "tunic", layering_role: "base_layer", seasons: ["spring", "summer", "fall"], phrasings: ["a tunic", "a long loose top that falls past the hips"] },
  { id: "vest", label: "Vest", category: "top", sub_category: "vest", layering_role: "mid_layer", seasons: ["fall", "winter"], phrasings: ["a waistcoat", "a tailored sleeveless vest with buttons, worn over a shirt"] },

  // --- bottoms ---
  { id: "jeans", label: "Jeans", category: "bottom", sub_category: "jeans", layering_role: "base_layer", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["jeans", "blue denim jeans with five pockets and contrast stitching"] },
  { id: "trousers", label: "Trousers", category: "bottom", sub_category: "trousers", layering_role: "base_layer", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["tailored dress trousers with a pressed crease", "formal suit pants in smooth woven fabric", "chinos"] },
  { id: "shorts", label: "Shorts", category: "bottom", sub_category: "shorts", layering_role: "base_layer", seasons: ["spring", "summer"], phrasings: ["shorts", "short trousers cut to end above the knee, showing bare legs"] },
  { id: "skirt", label: "Skirt", category: "bottom", sub_category: "skirt", layering_role: "base_layer", seasons: ["spring", "summer", "fall"], phrasings: ["a skirt", "a skirt with an open hem and no separate legs"] },
  { id: "leggings", label: "Leggings", category: "bottom", sub_category: "leggings", layering_role: "base_layer", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["leggings", "tight stretchy tights that hug the leg"] },
  { id: "joggers", label: "Joggers", category: "bottom", sub_category: "joggers", layering_role: "base_layer", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["joggers", "soft jersey sweatpants with an elastic drawstring waistband", "grey cotton track pants"] },
  { id: "cargo_pants", label: "Cargo pants", category: "bottom", sub_category: "cargo pants", layering_role: "base_layer", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["cargo pants with large flap pockets on the thighs"] },
  { id: "palazzo", label: "Palazzo", category: "bottom", sub_category: "palazzo", layering_role: "base_layer", seasons: ["spring", "summer"], phrasings: ["wide-leg palazzo trousers that flare loosely from the waist"] },

  // --- one piece ---
  { id: "dress", label: "Dress", category: "one_piece", sub_category: "dress", layering_role: "standalone", seasons: ["spring", "summer", "fall"], phrasings: ["a dress", "a one-piece dress joining bodice and skirt"] },
  { id: "jumpsuit", label: "Jumpsuit", category: "one_piece", sub_category: "jumpsuit", layering_role: "standalone", seasons: ["spring", "summer", "fall"], phrasings: ["a jumpsuit", "a one-piece outfit with a top joined to full-length trouser legs"] },
  { id: "romper", label: "Romper", category: "one_piece", sub_category: "romper", layering_role: "standalone", seasons: ["summer"], phrasings: ["a romper", "a playsuit joining a top to short legs"] },
  { id: "gown", label: "Gown", category: "one_piece", sub_category: "gown", layering_role: "standalone", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["a formal evening gown", "a floor-length ball gown"] },
  { id: "saree", label: "Saree", category: "one_piece", sub_category: "saree", layering_role: "standalone", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["a saree", "an Indian sari, a long draped cloth with a decorated border"] },
  { id: "kurta", label: "Kurta", category: "one_piece", sub_category: "kurta", layering_role: "standalone", seasons: ["spring", "summer", "fall"], phrasings: ["a kurta", "a long straight Indian tunic with side slits"] },

  // --- outerwear ---
  { id: "jacket", label: "Jacket", category: "outerwear", sub_category: "jacket", layering_role: "outerwear", seasons: ["spring", "fall", "winter"], phrasings: ["a jacket", "a hip-length zip or button jacket worn as an outer layer"] },
  { id: "coat", label: "Coat", category: "outerwear", sub_category: "coat", layering_role: "outerwear", seasons: ["fall", "winter"], phrasings: ["a long coat", "a heavy overcoat falling below the hips"] },
  { id: "blazer", label: "Blazer", category: "outerwear", sub_category: "blazer", layering_role: "outerwear", seasons: ["spring", "fall", "winter"], phrasings: ["a blazer", "a structured suit jacket with notched lapels"] },
  { id: "cardigan", label: "Cardigan", category: "outerwear", sub_category: "cardigan", layering_role: "mid_layer", seasons: ["spring", "fall", "winter"], phrasings: ["a cardigan", "a knitted sweater that opens all the way down the front"] },
  { id: "shrug", label: "Shrug", category: "outerwear", sub_category: "shrug", layering_role: "mid_layer", seasons: ["spring", "fall"], phrasings: ["a shrug", "a very short open cover-up over the shoulders"] },
  { id: "windbreaker", label: "Windbreaker", category: "outerwear", sub_category: "windbreaker", layering_role: "outerwear", seasons: ["spring", "fall"], phrasings: ["a windbreaker", "a thin glossy nylon rain shell"] },
  { id: "parka", label: "Parka", category: "outerwear", sub_category: "parka", layering_role: "outerwear", seasons: ["winter"], phrasings: ["a parka", "a thick padded winter coat with a fur-trimmed hood"] },

  // --- footwear ---
  { id: "sneakers", label: "Sneakers", category: "footwear", sub_category: "sneakers", layering_role: "footwear", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["sneakers", "casual lace-up trainers with a rubber sole"] },
  { id: "boots", label: "Boots", category: "footwear", sub_category: "boots", layering_role: "footwear", seasons: ["fall", "winter"], phrasings: ["boots", "shoes with tall shafts rising above the ankle"] },
  { id: "sandals", label: "Sandals", category: "footwear", sub_category: "sandals", layering_role: "footwear", seasons: ["summer"], phrasings: ["sandals", "open shoes made of straps that leave the toes bare"] },
  { id: "heels", label: "Heels", category: "footwear", sub_category: "heels", layering_role: "footwear", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["high heel shoes", "women's shoes on a tall narrow heel"] },
  { id: "loafers", label: "Loafers", category: "footwear", sub_category: "loafers", layering_role: "footwear", seasons: ["spring", "summer", "fall"], phrasings: ["loafers", "flat leather slip-on shoes with no laces"] },
  { id: "flats", label: "Flats", category: "footwear", sub_category: "flats", layering_role: "footwear", seasons: ["spring", "summer", "fall"], phrasings: ["ballet flats", "thin flat women's shoes with a rounded toe"] },
  { id: "slippers", label: "Slippers", category: "footwear", sub_category: "slippers", layering_role: "footwear", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["slippers", "soft indoor house shoes"] },
  { id: "sports_shoes", label: "Sports shoes", category: "footwear", sub_category: "sports shoes", layering_role: "footwear", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["running shoes", "athletic trainers with a thick cushioned midsole"] },

  // --- accessories ---
  { id: "bag", label: "Bag", category: "accessory", sub_category: "bag", layering_role: "standalone", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["a handbag", "a bag with a carrying strap or handle"] },
  { id: "hat", label: "Hat", category: "accessory", sub_category: "hat", layering_role: "standalone", seasons: ["spring", "summer", "fall"], phrasings: ["a wide-brimmed sun hat", "a bucket hat", "a felt fedora with a brim all the way round"] },
  { id: "cap", label: "Cap", category: "accessory", sub_category: "cap", layering_role: "standalone", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["a baseball cap with a curved peak at the front", "a snapback cap with a flat brim and an embroidered logo"] },
  { id: "scarf", label: "Scarf", category: "accessory", sub_category: "scarf", layering_role: "standalone", seasons: ["fall", "winter"], phrasings: ["a scarf", "a long strip of cloth wound round the neck"] },
  { id: "belt", label: "Belt", category: "accessory", sub_category: "belt", layering_role: "standalone", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["a belt", "a narrow leather strap with a buckle"] },
  { id: "sunglasses", label: "Sunglasses", category: "accessory", sub_category: "sunglasses", layering_role: "standalone", seasons: ["spring", "summer"], phrasings: ["sunglasses", "eyeglasses with tinted lenses in a frame"] },
  { id: "watch", label: "Watch", category: "accessory", sub_category: "watch", layering_role: "standalone", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["a wristwatch", "a watch with a round dial on a strap"] },
  { id: "jewellery", label: "Jewellery", category: "accessory", sub_category: "jewellery", layering_role: "standalone", seasons: ["spring", "summer", "fall", "winter"], phrasings: ["jewellery", "a fine metal necklace, ring or pair of earrings"] },
];

// ------------------------------------------------------------------
// Attributes
// ------------------------------------------------------------------

type AttributeOption<T extends string> = { value: T; phrasings: string[] };

export const SLEEVE_OPTIONS: AttributeOption<SleeveLength>[] = [
  { value: "sleeveless", phrasings: ["a sleeveless garment with bare shoulders", "clothing with no sleeves"] },
  { value: "short", phrasings: ["a garment with short sleeves ending above the elbow"] },
  { value: "three_quarter", phrasings: ["a garment with three-quarter length sleeves ending below the elbow"] },
  { value: "long", phrasings: ["a garment with long sleeves reaching the wrist"] },
];

export const WEIGHT_OPTIONS: AttributeOption<ApparentWeight>[] = [
  { value: "light", phrasings: ["a thin lightweight fabric garment", "sheer airy clothing"] },
  { value: "medium", phrasings: ["a midweight fabric garment"] },
  { value: "heavy", phrasings: ["a thick heavy fabric garment", "bulky padded clothing"] },
];

export const WARMTH_OPTIONS: AttributeOption<WarmthLevel>[] = [
  { value: "low", phrasings: ["cool breathable clothing for hot weather"] },
  { value: "medium", phrasings: ["moderately warm clothing for mild weather"] },
  { value: "high", phrasings: ["very warm insulating clothing for cold weather"] },
];

export const FORMALITY_OPTIONS: AttributeOption<Formality>[] = [
  { value: "casual", phrasings: ["casual everyday clothing"] },
  { value: "business_casual", phrasings: ["smart casual business clothing"] },
  { value: "formal", phrasings: ["formal elegant evening clothing"] },
  { value: "athletic", phrasings: ["athletic sportswear for exercise"] },
  { value: "lounge", phrasings: ["loungewear or sleepwear worn at home"] },
];

// ------------------------------------------------------------------
// The prompt set
// ------------------------------------------------------------------

export type PromptGroup = { id: string; prompts: string[] };

const fill = (template: string, phrase: string) => template.replace("{}", phrase);

/**
 * Every label paired with the sentences that describe it.
 *
 * The precompute step embeds each sentence, averages them per label and stores
 * one vector per label — so the runtime table is ~65 rows rather than ~250, and
 * the classifier is a single matrix multiply.
 */
export function buildPromptGroups(): PromptGroup[] {
  const groups: PromptGroup[] = [];

  for (const entry of CATEGORY_ENTRIES) {
    groups.push({
      id: `category:${entry.id}`,
      prompts: CATEGORY_TEMPLATES.flatMap((t) => entry.phrasings.map((p) => fill(t, p))),
    });
  }

  const attributes: [string, AttributeOption<string>[]][] = [
    ["sleeve_length", SLEEVE_OPTIONS],
    ["apparent_weight", WEIGHT_OPTIONS],
    ["warmth", WARMTH_OPTIONS],
    ["formality", FORMALITY_OPTIONS],
  ];
  for (const [group, options] of attributes) {
    for (const option of options) {
      groups.push({
        id: `${group}:${option.value}`,
        prompts: ATTRIBUTE_TEMPLATES.flatMap((t) => option.phrasings.map((p) => fill(t, p))),
      });
    }
  }

  return groups;
}
