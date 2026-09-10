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

export type Category = (typeof CATEGORIES)[number];
export type Formality = (typeof FORMALITIES)[number];
export type LayeringRole = (typeof LAYERING_ROLES)[number];
export type Occasion = (typeof OCCASIONS)[number];

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
  min_temp_f: number;
  max_temp_f: number;
  suitable_conditions: string[];
  occasions: string[];
  wear_notes: string | null;
  layering_role: LayeringRole;
  created_at: string;
};

export type GarmentTags = {
  item_name: string;
  category: Category;
  sub_category: string;
  primary_color: string;
  secondary_colors: string[];
  formality: Formality;
  weather_compatibility: {
    min_temp_f: number;
    max_temp_f: number;
    suitable_conditions: string[];
  };
  occasions: string[];
  wear_notes: string;
  layering_role: LayeringRole;
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
  top: ["t-shirt", "shirt", "blouse", "sweater", "hoodie", "tank", "polo", "crop top", "tunic", "vest"],
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
