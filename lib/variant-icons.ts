import emojiByChar from "unicode-emoji-json/data-by-emoji.json"

export interface VariantEmojiEntry {
  emoji: string
  name: string
  group: string
}

export const VARIANT_EMOJI_LIST: VariantEmojiEntry[] = Object.entries(
  emojiByChar as Record<string, { name: string; group: string }>
).map(([emoji, meta]) => ({ emoji, name: meta.name, group: meta.group }))

export const VARIANT_EMOJI_GROUPS = [
  "Smileys & Emotion",
  "People & Body",
  "Animals & Nature",
  "Food & Drink",
  "Travel & Places",
  "Activities",
  "Objects",
  "Symbols",
  "Flags",
] as const

// Sugestões rápidas pro seletor de variante (cores/modelos de periférico).
export const VARIANT_EMOJI_SUGGESTIONS = [
  "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤",
  "⭐", "✨", "🔥", "💧", "❄️", "⚡", "🌙", "☀️", "🍃",
  "🎮", "⌨️", "🖱️", "🎧", "🔊",
]

export function isKnownVariantEmoji(value: string | null | undefined): boolean {
  if (!value) return false
  return Object.prototype.hasOwnProperty.call(emojiByChar, value)
}
