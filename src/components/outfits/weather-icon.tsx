import {
  Cloud,
  CloudRain,
  CloudSnow,
  Sun,
  Wind,
  Zap,
  type LucideProps,
} from "lucide-react";
import type { WeatherCondition } from "@/lib/weather";

const ICONS: Record<
  WeatherCondition,
  React.ComponentType<LucideProps>
> = {
  sunny: Sun,
  cloudy: Cloud,
  rainy: CloudRain,
  snowy: CloudSnow,
  windy: Wind,
  stormy: Zap,
};

export function WeatherIcon({
  condition,
  ...props
}: { condition: WeatherCondition } & LucideProps) {
  const Icon = ICONS[condition] ?? Cloud;
  return <Icon {...props} />;
}
