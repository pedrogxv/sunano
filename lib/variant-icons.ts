import {
  Circle,
  Square,
  Triangle,
  Star,
  Heart,
  Diamond,
  Hexagon,
  Sparkles,
  Sun,
  Moon,
  Flame,
  Snowflake,
  Zap,
  Droplet,
  Leaf,
  type LucideIcon,
} from "lucide-react"

export const VARIANT_ICONS: Record<string, LucideIcon> = {
  circle: Circle,
  square: Square,
  triangle: Triangle,
  star: Star,
  heart: Heart,
  diamond: Diamond,
  hexagon: Hexagon,
  sparkles: Sparkles,
  sun: Sun,
  moon: Moon,
  flame: Flame,
  snowflake: Snowflake,
  zap: Zap,
  droplet: Droplet,
  leaf: Leaf,
}

export const VARIANT_ICON_NAMES = Object.keys(VARIANT_ICONS)

export function getVariantIcon(name: string | null | undefined): LucideIcon | null {
  if (!name) return null
  return VARIANT_ICONS[name] ?? null
}
