"use client"

import Image from "next/image"

import { AlertTriangle } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_TAG_STYLES, CARD_TIER_STYLES, RATING_LEVEL_COLORS, TIER_THEMES } from "@/lib/tierlist-theme"
import { useLocale } from "@/components/providers/locale-context"
import type { Tag } from "@/lib/tag-options"
import { tierLabel as tierDisplayLabel } from "@/lib/tier-utils"

type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"

export type RatingKey = "overall" | "performance" | "build" | "value" | "software" | "battery" | "qc"
export type Ratings = Partial<Record<RatingKey, number>>

const RATING_ORDER: RatingKey[] = ["overall", "performance", "build", "value", "software", "battery", "qc"]

const RATING_LABELS_PT: Record<RatingKey, string> = {
  overall: "Geral",
  performance: "Performance",
  build: "Construção",
  value: "Custo-Benefício",
  software: "Software",
  battery: "Bateria",
  qc: "Controle de Qualidade",
}

const RATING_LABELS_EN: Record<RatingKey, string> = {
  overall: "Overall",
  performance: "Performance",
  build: "Build",
  value: "Value",
  software: "Software",
  battery: "Battery",
  qc: "QC",
}

const TAG_LABELS: Record<Tag, { en: string; pt: string }> = {
  competitive: { en: "Competitive", pt: "Competitivo" },
  versatile: { en: "Bomba", pt: "Bomba" },
  value: { en: "Value", pt: "Custo-benefício" },
  cheap: { en: "Cheap", pt: "Barato" },
  expensive: { en: "Expensive", pt: "Caro" },
  light: { en: "Light", pt: "Leve" },
  heavy: { en: "Heavy", pt: "Pesado" },
  unbalanced: { en: "Unbalanced weight", pt: "Peso Desbalanceado" },
  dpi_deviation: { en: "DPI Deviation", pt: "DPI Deviation" },
  wobble_high: { en: "High wobble", pt: "Wooble Alto" },
  wobble_low: { en: "Low wobble", pt: "Wooble Baixo" },
  scroll_hard: { en: "Hard scroll", pt: "Scroll Duro" },
  scroll_soft: { en: "Soft scroll", pt: "Scroll Mole" },
  trimode: { en: "Trimode", pt: "Trimode" },
  stable: { en: "Stable", pt: "Estável" },
  unstable: { en: "Unstable", pt: "Instável" },
  "8_80": { en: "8 80", pt: "8 80" },
  poron: { en: "Poron", pt: "Poron" },
  borracha: { en: "Rubber", pt: "Borracha" },
  grosso: { en: "Thick", pt: "Grosso" },
  fino: { en: "Thin", pt: "Fino" },
  rapido: { en: "Fast", pt: "Rápido" },
  devagar: { en: "Slow", pt: "Devagar" },
  hibrido: { en: "Hybrid", pt: "Híbrido" },
  aspero: { en: "Rough", pt: "Áspero" },
  liso: { en: "Smooth", pt: "Liso" },
  mug: { en: "Mug", pt: "Mug" },
  macio: { en: "Soft", pt: "Macio" },
  afetado_umidade: { en: "Humidity Affected", pt: "Afetado por Umidade" },
  ultrapassado: { en: "Outdated", pt: "Ultrapassado" },
  raro: { en: "Rare", pt: "Raro" },
  fibra_carbono: { en: "Carbon Fiber", pt: "Fibra de Carbono" },
  control: { en: "Control", pt: "Control" },
  speed: { en: "Speed", pt: "Speed" },
  silicone: { en: "Silicone", pt: "Silicone" },
  ia: { en: "AI", pt: "IA" },
  white_label: { en: "White Label", pt: "White Label" },
  ips: { en: "IPS", pt: "IPS" },
  va: { en: "VA", pt: "VA" },
  tn: { en: "TN", pt: "TN" },
  oled: { en: "OLED", pt: "OLED" },
  miniled: { en: "MiniLED", pt: "MINILED" },
  fhd: { en: "FHD", pt: "FHD" },
  qhd: { en: "QHD", pt: "QHD" },
  "4k": { en: "4K", pt: "4K" },
  headphone: { en: "Headphone", pt: "Headphone" },
  wired: { en: "Wired", pt: "Com fio" },
  wireless: { en: "Wireless", pt: "Sem fio" },
  padrao_atx: { en: "ATX standard", pt: "Padrão ATX" },
  full_modular: { en: "Full modular", pt: "Full Modular" },
  semi_modular: { en: "Semi modular", pt: "Semi Modular" },
  white_noise: { en: "White noise", pt: "White Noise" },
  bom_ripple: { en: "Good ripple", pt: "Bom Ripple" },
  ripple_ruim: { en: "Bad ripple", pt: "Ripple Ruim" },
  fonte_instavel: { en: "Unstable PSU", pt: "Fonte Instável" },
  "80_plus": { en: "80 Plus", pt: "80% Plus" },
  selo_cybenetics: { en: "Cybenetics", pt: "Selo Cybenetics" },
  capacitor_japones: { en: "Japanese capacitor", pt: "Capacitor Japonês" },
  v_shaped: { en: "V-Shaped", pt: "V-Shaped" },
  u_shaped: { en: "U-Shaped", pt: "U-Shaped" },
  neutro: { en: "Neutral", pt: "Neutro" },
  neutro_quente: { en: "Warm neutral", pt: "Neutro Quente" },
  quente: { en: "Warm", pt: "Quente" },
  escuro: { en: "Dark", pt: "Escuro" },
  basshead: { en: "Basshead", pt: "Basshead" },
  vocal_forward: { en: "Vocal Forward", pt: "Vocal Forward" },
  harman: { en: "Harman", pt: "Harman" },
  ief_neutral: { en: "IEF Neutral", pt: "IEF Neutral" },
  jm_1: { en: "JM-1", pt: "JM-1" },
  sub_bass_focus: { en: "Sub-bass Focus", pt: "Sub-bass Focus" },
  mid_bass_focus: { en: "Mid-bass Focus", pt: "Mid-bass Focus" },
  punchy: { en: "Punchy", pt: "Punchy" },
  smooth: { en: "Smooth", pt: "Smooth" },
  arejado: { en: "Airy", pt: "Arejado" },
  sibilante: { en: "Sibilant", pt: "Sibilante" },
  detalhado: { en: "Detailed", pt: "Detalhado" },
  palco_amplo: { en: "Wide Soundstage", pt: "Palco Amplo" },
  boa_separacao: { en: "Good Separation", pt: "Boa Separação" },
  metal: { en: "Metal", pt: "Metal" },
  resina: { en: "Resin", pt: "Resina" },
  plastico: { en: "Plastic", pt: "Plástico" },
  shell_pequeno: { en: "Small Shell", pt: "Shell Pequeno" },
  shell_grande: { en: "Large Shell", pt: "Shell Grande" },
  deep_fit: { en: "Deep Fit", pt: "Deep Fit" },
  boa_isolacao: { en: "Good Isolation", pt: "Boa Isolação" },
  driver_flex: { en: "Driver Flex", pt: "Driver Flex" },
  planar: { en: "Planar", pt: "Planar" },
}

export interface TierItemTooltipContentProps {
  name: string
  brand: string
  categoryLabel: string
  image_url: string | null
  tier: Tier | null
  // Public-only field (rating-first design)
  ratings?: Ratings
  // Legacy fields (admin still uses these). Render only when provided.
  tags?: Tag[]
  specs?: Array<{ label: string; value: string }>
  displayPrice?: string
  // Presentes quando o item vem do agrupamento por faixa de preço (aba Custo
  // Benefício) — nesse caso `tier` vem null e o badge de rank é substituído
  // pelo badge de faixa (e, se for GOLPE, por um aviso com o motivo).
  priceBand?: string
  golpeMotivo?: string
}

function formatLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatTagLabel(tag: Tag, isEnglish?: boolean) {
  const label = TAG_LABELS[tag]
  if (!label) return formatLabel(tag)
  return isEnglish ? label.en : label.pt
}

function RatingRow({ label, value }: { label: string; value: number }) {
  const filled = Math.max(0, Math.min(6, Math.round(value)))
  const levelColor = RATING_LEVEL_COLORS[filled]
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <span className={cn("text-[11px] font-bold tabular-nums", levelColor.text)}>
          {filled}<span className="text-muted-foreground">/6</span>
        </span>
      </div>
      <div className="flex h-1.5 gap-0.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-sm transition-colors",
              i < filled ? levelColor.bar : "bg-muted",
            )}
          />
        ))}
      </div>
    </div>
  )
}

export function TierItemTooltipContent({
  name,
  brand,
  categoryLabel,
  image_url,
  tier,
  ratings,
  tags,
  specs,
  displayPrice,
  priceBand,
  golpeMotivo,
}: TierItemTooltipContentProps) {
  const { locale } = useLocale()
  const en = locale === "en-US"
  const tierStyle = tier ? CARD_TIER_STYLES[tier] : CARD_TIER_STYLES.L
  const tierTheme = tier ? TIER_THEMES[tier] : TIER_THEMES.L
  const tierLabel = tier ? tierDisplayLabel(tier, categoryLabel) : (en ? "Under Review" : "Sob Revisão")
  const isGolpe = Boolean(golpeMotivo)

  const labels = en ? RATING_LABELS_EN : RATING_LABELS_PT
  const batteryLabel = categoryLabel === "keyboard"
    ? (en ? "Typing" : "Digitação")
    : categoryLabel === "mousepad"
      ? (en ? "Stitching" : "Costura")
      : categoryLabel === "psu"
        ? (en ? "Warranty" : "Garantia")
        : labels.battery
  const ratingEntries = ratings
    ? RATING_ORDER.filter((key, index) => RATING_ORDER.indexOf(key) === index)
        .filter((key) => typeof ratings[key] === "number")
        .map((key) => {
          let label = key === "battery" ? batteryLabel : labels[key]
          if (categoryLabel === "mousepad") {
            if (key === "software") label = "Base"
            if (key === "build") label = en ? "Surface" : "Superfície"
          }
          // Fonte: as mesmas notas com o nome que a categoria usa (ver o formulário
          // de admin e a página do periférico).
          if (categoryLabel === "psu") {
            if (key === "performance") label = "Ripple"
            if (key === "build") label = en ? "Components" : "Componentes"
            if (key === "software") label = en ? "Energy efficiency" : "Eficiência Energética"
          }
          return { key, label, value: ratings[key] as number }
        })
    : []

  return (
    <div className="w-[260px] space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl text-sm font-bold shadow-lg",
            // tierStyle.bg é preto fixo: serve de fundo para as iniciais da marca
            // no fallback, mas com foto virava um quadrado preto no tema claro.
            !image_url && tierStyle.bg,
            !image_url && tierStyle.text,
          )}
          style={image_url ? { background: "var(--card-image-bg)" } : undefined}
        >
          {image_url ? (
            <Image src={image_url} alt={name} width={56} height={56} className="h-full w-full object-contain p-0.5" />
          ) : (
            brand.slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{brand}</p>
          <p className="mt-0.5 text-[10px] capitalize text-muted-foreground">{categoryLabel}</p>
        </div>
      </div>

      {/* Rank (tier badge) — em modo faixa de preço, o badge de tier some e vira o
          badge da própria faixa (ou um aviso, se for GOLPE). */}
      <div className="flex items-center gap-2">
        {priceBand ? (
          <span
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-black",
              isGolpe ? "bg-red-600 text-white" : cn("bg-gradient-to-r", tierTheme.accent, tierTheme.textColor),
            )}
          >
            {priceBand}
          </span>
        ) : (
          <span
            className={cn(
              "rounded-md bg-gradient-to-r px-2.5 py-1 text-[11px] font-black",
              tierTheme.accent,
              tierTheme.textColor,
            )}
          >
            {tierLabel}
          </span>
        )}
        {displayPrice && (
          <span className="text-sm font-bold text-emerald-400">{displayPrice}</span>
        )}
      </div>

      {isGolpe && golpeMotivo && (
        <div className="flex items-start gap-2 rounded-md border border-red-600/40 bg-red-600/10 px-2.5 py-2">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-400" />
          <p className="text-[11px] leading-snug text-red-300">{golpeMotivo}</p>
        </div>
      )}

      {/* Tags */}
      {tags && tags.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  CARD_TAG_STYLES[tag].bg,
                  CARD_TAG_STYLES[tag].text,
                  CARD_TAG_STYLES[tag].border,
                )}
              >
                {formatTagLabel(tag, en)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Ratings (public-first) */}
      {ratings && (
        <div>
          {ratingEntries.length > 0 ? (
            <div className="space-y-2">
              {ratingEntries.map((entry) => (
                <RatingRow key={entry.key} label={entry.label} value={entry.value} />
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {en ? "No ratings yet" : "Sem avaliações ainda"}
            </p>
          )}
        </div>
      )}

      {/* Specs (admin only) */}
      {specs && specs.length > 0 && (
        <div>
          <div className="grid grid-cols-2 gap-1.5">
            {specs.slice(0, 4).map((spec) => (
              <div
                key={spec.label}
                className="rounded-md border border-border bg-muted px-2.5 py-2"
              >
                <p className="text-[9px] font-medium text-muted-foreground">{spec.label}</p>
                <p className="text-xs font-semibold text-foreground">{spec.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
