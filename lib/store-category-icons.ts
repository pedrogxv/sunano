import { Camera, Cable, Gamepad2, Headphones, Keyboard, Mic, Monitor, Mouse, Package, RectangleHorizontal, type LucideIcon } from "lucide-react"

/**
 * Categoria é texto livre cadastrado pelo admin — sem enum no banco. Mapeia
 * por palavra-chave pra dar um ícone/cor consistente nos tiles e placeholders
 * de imagem da Loja, com fallback neutro pra categorias não reconhecidas.
 */
const CATEGORY_ICON_RULES: { match: RegExp; icon: LucideIcon; tint: string }[] = [
  { match: /mouse\s*pad/i, icon: RectangleHorizontal, tint: "oklch(0.7 0.15 160)" },
  { match: /mouse/i, icon: Mouse, tint: "oklch(0.75 0.15 195)" },
  { match: /teclado|keyboard/i, icon: Keyboard, tint: "oklch(0.8 0.15 85)" },
  { match: /headset|fone|headphone/i, icon: Headphones, tint: "oklch(0.7 0.15 340)" },
  { match: /monitor/i, icon: Monitor, tint: "oklch(0.72 0.14 260)" },
  { match: /webcam|câmera|camera/i, icon: Camera, tint: "oklch(0.75 0.15 195)" },
  { match: /microfone|mic\b/i, icon: Mic, tint: "oklch(0.7 0.15 25)" },
  { match: /cabo|cable|adaptador|hub/i, icon: Cable, tint: "oklch(0.65 0.08 250)" },
  { match: /controle|gamepad|joystick/i, icon: Gamepad2, tint: "oklch(0.7 0.18 25)" },
]

const FALLBACK: { icon: LucideIcon; tint: string } = { icon: Package, tint: "oklch(0.65 0.01 260)" }

export function getCategoryIcon(category: string | null | undefined): { icon: LucideIcon; tint: string } {
  if (!category) return FALLBACK
  const rule = CATEGORY_ICON_RULES.find((r) => r.match.test(category))
  return rule ? { icon: rule.icon, tint: rule.tint } : FALLBACK
}
