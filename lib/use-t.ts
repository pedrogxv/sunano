"use client"

import { useLocale } from "@/components/providers/locale-context"

/** Textos do idioma ativo. O dicionário vem do `LocaleProvider` (en-US sob demanda). */
export function useT() {
  return useLocale().dictionary
}
