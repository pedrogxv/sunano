export type LocaleCode = "pt-BR" | "en-US"

export type LanguageEntry = {
  code: LocaleCode
  label: string
  nativeLabel: string
  shortLabel: string
}

export const DEFAULT_LOCALE: LocaleCode = "pt-BR"
export const LANGUAGE_STORAGE_KEY = "sunano:locale"

export const LANGUAGE_OPTIONS: LanguageEntry[] = [
  {
    code: "pt-BR",
    label: "Português",
    nativeLabel: "Português (Brasil)",
    shortLabel: "PT",
  },
  {
    code: "en-US",
    label: "English",
    nativeLabel: "English (US)",
    shortLabel: "EN",
  },
]

export const I18N = {
  "pt-BR": {
    topbar: {
      languageLabel: "Idioma",
      languageHelper: "Escolha o idioma da interface",
      themeLabel: "Tema",
      themeHelper: "Escolha um clima de cor",
    },
  },
  "en-US": {
    topbar: {
      languageLabel: "Language",
      languageHelper: "Choose the interface language",
      themeLabel: "Theme",
      themeHelper: "Pick a color mood",
    },
  },
} as const

export function isLocaleCode(value: string): value is LocaleCode {
  return LANGUAGE_OPTIONS.some((option) => option.code === value)
}

export function getLocale(value?: string | null): LocaleCode {
  if (!value) return DEFAULT_LOCALE
  return isLocaleCode(value) ? value : DEFAULT_LOCALE
}

export function getLanguageEntry(locale: LocaleCode) {
  return LANGUAGE_OPTIONS.find((option) => option.code === locale) ?? LANGUAGE_OPTIONS[0]
}
