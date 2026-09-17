export const CATEGORIES = [
  "top",
  "bottom",
  "one_piece",
  "outerwear",
  "footwear",
  "accessory",
] as const;

export const FORMALITIES = [
  "casual",
  "business_casual",
  "formal",
  "athletic",
  "lounge",
] as const;

export const LAYERING_ROLES = [
  "base_layer",
  "mid_layer",
  "outerwear",
  "standalone",
  "footwear",
] as const;

export const CONDITIONS = [
  "sunny",
  "cloudy",
  "rainy",
  "snowy",
  "windy",
  "humid",
  "hot",
  "cold",
] as const;

/** The situations a piece can be worn in. Kept to a fixed list so the tags
 *  stay filterable rather than turning into free text. */
export const OCCASIONS = [
  "work",
  "business_meeting",
  "casual_outing",
  "date_night",
  "party",
  "wedding",
  "formal_event",
  "travel",
  "gym",
  "outdoor_activity",
  "beach",
  "lounging",
  "school",
  "religious_service",
] as const;

/** Calendar seasons, multi-select. A garment names the seasons it belongs to
 *  directly; `src/lib/seasons.ts` turns that into the temperature range the
 *  outfit engine scores against. Rain is deliberately *not* a season — it is
 *  orthogonal (a parka is winter and rain-ready) and lives in `rain_ready`. */
export const SEASONS = ["spring", "summer", "fall", "winter"] as const;

/** Visual attributes. Each is an estimate read off the photo, so every one of
 *  them is allowed to be null — "we could not tell" is a real answer and is
 *  always preferable to a confident guess. */
export const SLEEVE_LENGTHS = [
  "sleeveless",
  "short",
  "three_quarter",
  "long",
] as const;
export const APPARENT_WEIGHTS = ["light", "medium", "heavy"] as const;
export const WARMTH_LEVELS = ["low", "medium", "high"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Formality = (typeof FORMALITIES)[number];
export type LayeringRole = (typeof LAYERING_ROLES)[number];
export type Condition = (typeof CONDITIONS)[number];
export type Occasion = (typeof OCCASIONS)[number];
export type Season = (typeof SEASONS)[number];
export type SleeveLength = (typeof SLEEVE_LENGTHS)[number];
export type ApparentWeight = (typeof APPARENT_WEIGHTS)[number];
export type WarmthLevel = (typeof WARMTH_LEVELS)[number];

export function isSeason(value: string): value is Season {
  return (SEASONS as readonly string[]).includes(value);
}

/** A row as Postgres returned it. The array and attribute columns are typed
 *  loosely on purpose: the CHECK constraints permit values the unions do not
 *  (an empty `seasons`, a hand-edited row), and a cached outfit snapshot can
 *  predate the columns entirely. Narrow at the use site — `itemSeasons()` for
 *  seasons — rather than making TypeScript vouch for the database. */
export type WardrobeItem = {
  id: string;
  user_id: string;
  image_url: string;
  original_image_url: string | null;
  item_name: string;
  category: Category;
  sub_category: string;
  primary_color: string;
  secondary_colors: string[];
  formality: Formality;
  seasons: string[];
  rain_ready: boolean;
  sleeve_length: SleeveLength | null;
  /** The measured colour, in OKLCH. Null on rows written before the reader
   *  kept its coordinates, and on any item whose colour was set by hand. */
  color_l: number | null;
  color_c: number | null;
  color_h: number | null;
  apparent_weight: ApparentWeight | null;
  warmth: WarmthLevel | null;
  min_temp_f: number;
  max_temp_f: number;
  suitable_conditions: string[];
  occasions: string[];
  wear_notes: string | null;
  layering_role: LayeringRole;
  created_at: string;
};

export const CATEGORY_LABELS: Record<Category, string> = {
  top: "Top",
  bottom: "Bottom",
  one_piece: "One piece",
  outerwear: "Outerwear",
  footwear: "Footwear",
  accessory: "Accessory",
};

export const SUB_CATEGORIES: Record<Category, string[]> = {
  top: ["t-shirt", "shirt", "blouse", "sweater", "hoodie", "sweatshirt", "tank", "polo", "crop top", "tunic", "vest"],
  bottom: ["jeans", "trousers", "skirt", "shorts", "leggings", "joggers", "cargo pants", "short skirt", "palazzo"],
  one_piece: ["dress", "jumpsuit", "romper", "saree", "gown", "kurta"],
  outerwear: ["jacket", "coat", "blazer", "cardigan", "shrug", "windbreaker", "parka"],
  footwear: ["sneakers", "boots", "sandals", "heels", "loafers", "flats", "slippers", "sports shoes"],
  accessory: ["bag", "hat", "cap", "scarf", "belt", "sunglasses", "watch", "jewellery", "earrings", "necklace"],
};

export const FORMALITY_LABELS: Record<Formality, string> = {
  casual: "Casual",
  business_casual: "Business casual",
  formal: "Formal",
  athletic: "Athletic",
  lounge: "Lounge",
};

export const LAYERING_LABELS: Record<LayeringRole, string> = {
  base_layer: "Base layer",
  mid_layer: "Mid layer",
  outerwear: "Outerwear",
  standalone: "Standalone",
  footwear: "Footwear",
};

export const SEASON_LABELS: Record<Season, string> = {
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
  winter: "Winter",
};

export const SLEEVE_LABELS: Record<SleeveLength, string> = {
  sleeveless: "Sleeveless",
  short: "Short sleeve",
  three_quarter: "3/4 sleeve",
  long: "Long sleeve",
};

export const WEIGHT_LABELS: Record<ApparentWeight, string> = {
  light: "Lightweight",
  medium: "Midweight",
  heavy: "Heavyweight",
};

export const WARMTH_LABELS: Record<WarmthLevel, string> = {
  low: "Cool",
  medium: "Medium warmth",
  high: "Warm",
};

export const OCCASION_LABELS: Record<Occasion, string> = {
  work: "Work",
  business_meeting: "Business meeting",
  casual_outing: "Casual outing",
  date_night: "Date night",
  party: "Party",
  wedding: "Wedding",
  formal_event: "Formal event",
  travel: "Travel",
  gym: "Gym",
  outdoor_activity: "Outdoors",
  beach: "Beach",
  lounging: "Lounging",
  school: "School",
  religious_service: "Religious service",
};

export function occasionLabel(value: string): string {
  return (
    OCCASION_LABELS[value as Occasion] ??
    value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}
