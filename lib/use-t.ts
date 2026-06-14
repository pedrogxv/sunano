"use client"

import { useLocale } from "@/components/providers/locale-context"
import { translations } from "@/lib/i18n"

export function useT() {
  const { locale } = useLocale()
  return translations[locale]
}
