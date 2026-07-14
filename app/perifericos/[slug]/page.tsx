import Link from "next/link"
import { notFound } from "next/navigation"
import { Package, ShoppingBag } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getPeripheralByIdOrSlug, listAllPeripherals } from "@/lib/server/repositories/peripherals-repository"
import { listProductsByPeripheral } from "@/lib/server/repositories/store-repository"
import { listPublishedPostsByPeripheral } from "@/lib/server/repositories/blog-repository"
import { cn } from "@/lib/utils"
import { mapTier } from "@/lib/tier-utils"
import { CARD_TAG_STYLES, CARD_TIER_STYLES, RATING_LEVEL_COLORS, TIER_THEMES } from "@/lib/tierlist-theme"
import { BackButton } from "@/components/ui/back-button"
import { GripArchitectureImage } from "@/components/ui/grip-architecture-image"
import { PeripheralGallery } from "@/components/peripherals/PeripheralGallery"
import { RankingCrownBadge } from "@/components/peripherals/RankingCrownBadge"
import { formatBRL, formatCurrencyBRL } from "@/lib/stripe"

interface PerifericoPageProps {
  params: Promise<{ slug: string }>
}

export const dynamic = "force-dynamic"

function formatLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatCurrency(value: number) {
  try {
    return formatCurrencyBRL(value)
  } catch (error) {
    return `R$${value}`
  }
}

type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80" | "poron" | "borracha" | "grosso" | "fino" | "rapido" | "devagar" | "hibrido" | "aspero" | "liso" | "mug" | "macio" | "afetado_umidade" | "ultrapassado" | "magnetico"

const TAG_LABELS: Record<Tag, string> = {
  competitive: "Competitivo",
  versatile: "Bomba",
  value: "Custo-beneficio",
  cheap: "Barato",
  expensive: "Caro",
  light: "Leve",
  heavy: "Pesado",
  unbalanced: "Peso Desbalanceado",
  dpi_deviation: "DPI Deviation",
  wobble_high: "Wooble Alto",
  wobble_low: "Wooble Baixo",
  scroll_hard: "Scroll Duro",
  scroll_soft: "Scroll Mole",
  trimode: "Trimode",
  stable: "Estável",
  unstable: "Instável",
  "8_80": "8 80",
  poron: "Poron",
  borracha: "Borracha",
  grosso: "Grosso",
  fino: "Fino",
  rapido: "Rápido",
  devagar: "Devagar",
  hibrido: "Híbrido",
  aspero: "Áspero",
  liso: "Liso",
  mug: "Mug",
  macio: "Macio",
  afetado_umidade: "Afetado por Umidade",
  ultrapassado: "Ultrapassado",
  magnetico: "Magnético",
}

function formatTagLabel(tag: string, category?: string) {
  if (category === "keyboard" && tag === "light") return "Leve"
  if (category === "keyboard" && tag === "heavy") return "Pesado"
  return TAG_LABELS[tag as Tag] ?? formatLabel(tag)
}

function splitLines(value?: string | null) {
  if (!value) return []
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseLinkLines(value?: string | null) {
  return splitLines(value).map((line) => {
    const [label, url] = line.split("|").map((part) => part.trim())
    return {
      label: url ? label || "Comprar" : "Comprar",
      url: url || label,
    }
  })
}

function normalizeRating(value: unknown, max = 6) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(max, Math.round(parsed)))
}

function RatingRow({ label, rating }: { label: string; rating: number }) {
  const filled = Math.max(0, Math.min(6, Math.round(rating)))
  const levelColor = RATING_LEVEL_COLORS[filled]
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", levelColor.bg)}>
          {filled}/6
        </span>
      </div>
      <div className="flex h-3 items-center gap-1">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "h-3 flex-1 rounded transition-colors",
              index < filled ? levelColor.bar : "bg-muted/40",
            )}
          />
        ))}
      </div>
    </div>
  )
}

function getYoutubeEmbedId(url?: string | null) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, "")
    if (host === "youtu.be") {
      return parsed.pathname.slice(1) || null
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v")
      }
      const match = parsed.pathname.match(/^\/(embed|shorts)\/([^/?]+)/)
      if (match) return match[2]
    }
    return null
  } catch {
    return null
  }
}

function linkifyText(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noreferrer noopener"
        className="text-primary underline underline-offset-2 hover:text-primary/80"
      >
        {part}
      </a>
    ) : (
      <span key={index}>{part}</span>
    ),
  )
}

function formatSpecValue(value: unknown) {
  if (value === null || typeof value === "undefined" || value === "") return "-"
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return "-"
    return /^[a-z0-9-]+$/.test(trimmed) ? formatLabel(trimmed) : trimmed
  }
  return String(value)
}

export default async function PerifericoPage({ params }: PerifericoPageProps) {
  const resolvedParams = await params
  const slug = decodeURIComponent(resolvedParams.slug)

  const data = await getPeripheralByIdOrSlug(slug)

  if (!data) {
    notFound()
  }

  const specs = (data.specs ?? {}) as Record<string, any>
  const details = (specs.details ?? {}) as Record<string, any>

  const gallery = Array.isArray(details.gallery) ? details.gallery : splitLines(details.gallery)
  const pros = Array.isArray(details.pros) ? details.pros : splitLines(details.pros)
  const cons = Array.isArray(details.cons) ? details.cons : splitLines(details.cons)
  const buyLinks = Array.isArray(details.buyLinks) ? details.buyLinks : parseLinkLines(details.buyLinks)

  const ratings = {
    overall: normalizeRating(details?.ratings?.overall ?? details.ratingOverall),
    build: normalizeRating(details?.ratings?.build ?? details.ratingBuild),
    software: normalizeRating(details?.ratings?.software ?? details.ratingSoftware),
    battery: normalizeRating(details?.ratings?.battery ?? details.ratingBattery),
    performance: normalizeRating(details?.ratings?.performance ?? details.ratingPerformance),
    qc: normalizeRating(details?.ratings?.qc ?? details.ratingQc),
    value: normalizeRating(details?.ratings?.value ?? details.ratingValue),
  }

  const score = details.score != null ? Number(details.score) : null
  const reviewUrl = details.reviewUrl
  const youtubeId = getYoutubeEmbedId(reviewUrl)
  const softwareInfo = details.softwareInfo
  const teamComments = details.teamComments

  const linkedProducts = await listProductsByPeripheral(data.id)

  const linkedStore = linkedProducts.find((p) => p.type === "store") ?? null
  const linkedBazaar = linkedProducts.find((p) => p.type === "bazaar") ?? null

  const formatConnectivity = (v?: string) =>
    v === "wired" ? "Com fio" : v === "wireless" ? "Sem fio" : v

  const formatKeyboardType = (v?: string) =>
    v === "mechanical" ? "Mecânico" : v === "optical" ? "Óptico" : v === "magnetic" ? "Magnético" : v

  const formatTrimode = (v?: string) =>
    v === "yes" ? "Sim" : v === "no" ? "Não" : v

  const specsBase = [{ label: "Preco base", value: formatCurrency(data.price), group: "specs" as const }]

  const specsTable: { label: string; value: unknown; group: "specs" | "performance" }[] = (() => {
    switch (data.category) {
      case "mouse":
        return [...specsBase,
          { label: "Sensor", value: specs.driver ?? details.sensor, group: "specs" },
          { label: "Peso", value: details.weight ?? specs.weight, group: "specs" },
          { label: "Switch", value: details.switchType ?? specs.switchType, group: "specs" },
          { label: "Shape", value: details.shape ?? specs.mouseShape, group: "specs" },
          { label: "Coating", value: details.coating ?? specs.coating, group: "specs" },
          { label: "Latencia", value: details.latency ?? specs.latency, group: "performance" },
        ]
      case "keyboard":
        return [...specsBase,
          { label: "Layout", value: specs.keyboardLayout, group: "specs" },
          { label: "Tipo", value: formatKeyboardType(specs.keyboardType), group: "specs" },
          { label: "Conectividade", value: formatConnectivity(specs.connectivity), group: "specs" },
          { label: "Peso", value: details.weight ?? specs.weight, group: "specs" },
          { label: "Switch", value: details.switchType ?? specs.switchType, group: "performance" },
          { label: "Latencia", value: details.latency ?? specs.latency, group: "performance" },
          { label: "Deadzone", value: details.deadzone, group: "performance" },
          { label: "RT Minimo", value: details.rtMin, group: "performance" },
          { label: "Features", value: details.features, group: "performance" },
        ]
      case "mousepad":
      case "glasspad":
        return [...specsBase,
          { label: "Superficie", value: specs.surface ?? details.surface, group: "specs" },
          { label: "Tipo", value: specs.padType ?? details.padType, group: "specs" },
          { label: "Tamanho", value: specs.size ?? details.size, group: "specs" },
          { label: "Profile", value: specs.profile ?? details.profile, group: "specs" },
        ]
      case "monitors":
        return [...specsBase,
          { label: "Painel", value: specs.panelType, group: "specs" },
          { label: "Taxa de atualizacao", value: specs.refreshRate ? `${specs.refreshRate}Hz` : undefined, group: "performance" },
        ]
      case "headset":
      case "iem":
        return [...specsBase,
          { label: "Conectividade", value: formatConnectivity(specs.connectivity), group: "specs" },
          { label: "Compatibilidade", value: details.compatibility, group: "specs" },
        ]
      case "dac_amp":
        return [...specsBase,
          { label: "Conectividade", value: formatConnectivity(specs.connectivity), group: "specs" },
          { label: "Trimode", value: formatTrimode(specs.trimode), group: "specs" },
        ]
      case "switches":
        return [...specsBase,
          { label: "Tipo", value: formatKeyboardType(specs.keyboardType), group: "specs" },
          { label: "Switch", value: details.switchType ?? specs.switchType, group: "specs" },
        ]
      default:
        // feet, chairs — só preço base
        return [...specsBase]
    }
  })()

  const headlineSpecs = specsTable
    .map((spec) => ({ ...spec, display: formatSpecValue(spec.value) }))
    .filter((spec) => spec.display !== "-")
    .slice(0, 3)

  const specsRows = specsTable.filter((row) => row.group === "specs")
  const performanceRows = specsTable.filter((row) => row.group === "performance")

  const showGrip = data.category === "mouse"
  const gripInfo = [
    { label: "Mao pequena", value: details.gripSmall || "Claw/Palm" },
    { label: "Mao media", value: details.gripMedium || "Claw/Palm" },
    { label: "Mao grande", value: details.gripLarge || "Claw/Finger" },
  ]

  const tierStyle = data.tier ? TIER_THEMES[data.tier as keyof typeof TIER_THEMES] : null

  const relatedPosts = await listPublishedPostsByPeripheral(data.id)

  const allPeripherals = await listAllPeripherals()
  const rankedInCategory = allPeripherals
    .filter((p) => p.category === data.category)
    .map((p) => {
      const pDetails = ((p.specs as Record<string, unknown>)?.details ?? {}) as Record<string, unknown>
      const pScore = pDetails.score != null ? Number(pDetails.score) : null
      return { id: p.id, score: pScore }
    })
    .filter((p): p is { id: string; score: number } => typeof p.score === "number" && p.score > 0)
    .sort((a, b) => b.score - a.score)

  const rankIndex = rankedInCategory.findIndex((p) => p.id === data.id)
  const rankBadge = rankIndex >= 0 ? { position: rankIndex + 1, total: rankedInCategory.length } : null

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 md:px-6 lg:px-8">
      <div className="mb-3">
        <BackButton />
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <div className="space-y-3">
                {tierStyle ? (
                  <div className={cn("rounded-2xl bg-gradient-to-br px-4 py-3 text-center", tierStyle.accent, tierStyle.textColor)}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest opacity-60 mb-1">Classificação</p>
                    <p className="text-3xl font-bold tracking-tight leading-none">{data.tier ? mapTier(data.tier) : "Sob Revisão"}</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Classificação</p>
                    <p className="text-sm font-semibold text-foreground">{data.tier ? mapTier(data.tier) : "Sob Revisão"}</p>
                  </div>
                )}

                <PeripheralGallery images={[data.image_url, ...gallery]} alt={data.name} />

                <Card className="border-border bg-card">
                  <CardHeader className="space-y-1">
                    <CardTitle className="text-sm">Notas gerais</CardTitle>
                    <CardDescription className="text-sm">Escala de 0 a 6 (GOAT = 6)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <RatingRow label="Geral" rating={ratings.overall} />
                    <RatingRow label={data.category === "mousepad" ? "Superfície" : "Construção"} rating={ratings.build} />
                    <RatingRow label={data.category === "mousepad" ? "Base" : "Software"} rating={ratings.software} />
                    <RatingRow label={data.category === "keyboard" ? "Digitação" : data.category === "mousepad" ? "Costura" : "Bateria"} rating={ratings.battery} />
                    <RatingRow label="Performance" rating={ratings.performance} />
                    <RatingRow label="QC" rating={ratings.qc} />
                    <RatingRow label="Custo-beneficio" rating={ratings.value} />
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-sm">Software do Periférico</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {softwareInfo ? linkifyText(softwareInfo) : "Informacao de compatibilidade nao cadastrada."}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {data.category && (
                        <Badge variant="secondary" className="bg-muted/50 text-xs text-muted-foreground">
                          {formatLabel(data.category)}
                        </Badge>
                      )}
                      {data.tier && (
                        <Badge className="bg-primary/15 text-xs text-primary">
                          {data.tier}
                        </Badge>
                      )}
                    </div>

                    {rankBadge && (
                      <RankingCrownBadge position={rankBadge.position} total={rankBadge.total} />
                    )}
                  </div>

                  <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                    {data.name}
                  </h1>
                  <p className="text-sm text-muted-foreground">{data.brand}</p>

                  {data.tags?.length ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {data.tags.map((tag) => {
                        const style = CARD_TAG_STYLES[tag as Tag]
                        if (!style) {
                          return (
                            <Badge key={tag} variant="outline" className="border-border text-xs text-muted-foreground">
                              {formatTagLabel(tag, data.category)}
                            </Badge>
                          )
                        }
                        return (
                          <span
                            key={tag}
                            className={cn(
                              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                              style.bg,
                              style.text,
                              style.border,
                            )}
                          >
                            <span className={cn("size-1.5 rounded-full", style.dot)} />
                            {formatTagLabel(tag, data.category)}
                          </span>
                        )
                      })}
                    </div>
                  ) : null}

                  {headlineSpecs.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {headlineSpecs.map((spec) => (
                        <div
                          key={spec.label}
                          className="rounded-md border border-border bg-muted/30 px-2 py-1"
                        >
                          <span className="font-medium text-foreground/80">{spec.label}:</span>{" "}
                          <span className="font-semibold text-foreground">{spec.display}</span>
                        </div>
                      ))}
                    </div>
                  )}

                </div>

                <div className={cn("grid gap-4", showGrip ? "md:grid-cols-2" : "grid-cols-1")}>
                  <div className={cn("grid gap-2", performanceRows.length > 0 ? "sm:grid-cols-2" : "grid-cols-1")}>
                    <Card className="border-border bg-card">
                      <CardHeader>
                        <CardTitle className="text-sm">Especificações</CardTitle>
                        <CardDescription className="text-xs">Principais dados do produto.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm text-muted-foreground">
                        {specsRows.map((row) => (
                          <div key={row.label} className="flex items-center justify-between">
                            <span>{row.label}</span>
                            <span className="font-semibold text-foreground">{formatSpecValue(row.value)}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    {performanceRows.length > 0 && (
                      <Card className="border-border bg-card">
                        <CardHeader>
                          <CardTitle className="text-sm">Performance</CardTitle>
                          <CardDescription className="text-xs">Métricas de resposta.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-muted-foreground">
                          {performanceRows.map((row) => (
                            <div key={row.label} className="flex items-center justify-between">
                              <span>{row.label}</span>
                              <span className="font-semibold text-foreground">{formatSpecValue(row.value)}</span>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {showGrip && (
                    <Card className="border-border bg-card">
                      <CardHeader>
                        <CardTitle className="text-sm">Pegada</CardTitle>
                        <CardDescription className="text-xs">Recomendacao por tamanho de mao.</CardDescription>
                      </CardHeader>
                      <CardContent className="divide-y divide-border text-sm text-muted-foreground">
                        {gripInfo.map((row) => (
                          <div
                            key={row.label}
                            className="flex items-center justify-between gap-4 px-3 py-2"
                          >
                            <span className="text-foreground/80">{row.label}</span>
                            <span className="font-semibold text-foreground">{formatSpecValue(row.value)}</span>
                          </div>
                        ))}
                        <div className="pt-3">
                          <GripArchitectureImage />
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-sm">Review no Youtube</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {youtubeId ? (
                      <div className="space-y-2">
                        <div className="aspect-video overflow-hidden rounded-xl border border-border bg-muted/40">
                          <iframe
                            src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
                            title="Review no Youtube"
                            className="h-full w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                          />
                        </div>
                      </div>
                    ) : reviewUrl ? (
                      <Link
                        href={reviewUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm text-foreground transition hover:bg-muted/40"
                      >
                        <div className="flex size-12 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground">
                          Vídeo
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{"Review em vídeo"}</p>
                          <p className="text-xs text-muted-foreground">{"Ver review"}</p>
                        </div>
                        <span className="text-primary">→</span>
                      </Link>
                    ) : null}
                    {relatedPosts && relatedPosts.length > 0 && (
                      <div className="max-h-56 overflow-auto space-y-3">
                        {relatedPosts.map((post: any) => (
                          <Link
                            key={post.id}
                            href={`/blog/${post.slug}`}
                            className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm text-foreground transition hover:bg-muted/40"
                          >
                            <div className="size-12 overflow-hidden rounded-lg border border-border bg-muted/40">
                              {post.cover_thumbnail_url || post.cover_image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  alt={post.title}
                                  className="h-full w-full object-cover"
                                  src={post.cover_thumbnail_url || post.cover_image_url}
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                  Blog
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">{post.title}</p>
                              <p className="text-xs text-muted-foreground">Ver review</p>
                            </div>
                            <span className="text-primary">→</span>
                          </Link>
                        ))}
                      </div>
                    )}
                    {!reviewUrl && (!relatedPosts || relatedPosts.length === 0) && (
                      <p className="text-sm text-muted-foreground">
                        Nenhum review publicado para este periferico.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardContent className="max-h-80 overflow-auto pt-0 text-base text-muted-foreground">
                      <div className="grid gap-6 md:grid-cols-2">
                        <div>
                          <p className="mb-3 text-lg font-bold text-green-500">Pontos positivos</p>
                          {pros.length > 0 ? (
                            <ul className="list-disc space-y-2 pl-5 text-base">
                              {pros.map((item: string) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-base">Sem pontos fortes cadastrados.</p>
                          )}
                        </div>
                        <div>
                          <p className="mb-3 text-lg font-bold text-red-500">Pontos negativos</p>
                          {cons.length > 0 ? (
                            <ul className="list-disc space-y-2 pl-5 text-base">
                              {cons.map((item: string) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-base">Sem pontos fracos cadastrados.</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg">Comentarios</CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-80 overflow-auto text-base text-muted-foreground whitespace-pre-wrap">
                    {teamComments || "Sem observacoes adicionais."}
                  </CardContent>
                </Card>

                {(linkedStore || linkedBazaar) && (
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Disponível para comprar</CardTitle>
                      <CardDescription className="text-xs">Itens relacionados na Loja e no Bazar.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2">
                      {linkedStore && (
                        <Link
                          href={`/loja/${linkedStore.slug}`}
                          className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm text-foreground transition hover:bg-muted/40"
                        >
                          <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/40">
                            {linkedStore.images?.[0] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img alt={linkedStore.name} className="h-full w-full object-contain p-0.5" src={linkedStore.images[0]} />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                <ShoppingBag className="size-4" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-300">🛒 Loja</p>
                            <p className="truncate text-sm font-medium text-foreground">{linkedStore.name}</p>
                            <p className="text-xs text-emerald-400">
                              {formatBRL(linkedStore.price_cents)}
                              {linkedStore.stock === 0 && <span className="ml-2 text-rose-300">Esgotado</span>}
                            </p>
                          </div>
                          <span className="text-primary">→</span>
                        </Link>
                      )}
                      {linkedBazaar && (
                        <Link
                          href={`/bazar/${linkedBazaar.slug}`}
                          className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-foreground transition hover:bg-amber-500/10"
                        >
                          <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/40">
                            {linkedBazaar.images?.[0] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img alt={linkedBazaar.name} className="h-full w-full object-contain p-0.5" src={linkedBazaar.images[0]} />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                <Package className="size-4" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">♻️ Bazar</p>
                            <p className="truncate text-sm font-medium text-foreground">{linkedBazaar.name}</p>
                            <p className="text-xs text-emerald-400">
                              {formatBRL(linkedBazaar.price_cents)}
                              {linkedBazaar.stock === 0 && <span className="ml-2 text-rose-300">Esgotado</span>}
                            </p>
                          </div>
                          <span className="text-primary">→</span>
                        </Link>
                      )}
                    </CardContent>
                  </Card>
                )}

                {buyLinks.length > 0 && (
                  <Card className="border-border bg-card">
                    <CardHeader className="space-y-1">
                      <CardTitle className="text-sm">Onde comprar</CardTitle>
                      <CardDescription className="text-xs">Links oficiais e lojas recomendadas.</CardDescription>
                    </CardHeader>
                    <CardContent className="max-h-40 overflow-auto space-y-2">
                      {buyLinks.map((link: { label: string; url: string }) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/40"
                        >
                          <span>{link.label}</span>
                          <span className="text-primary">→</span>
                        </a>
                      ))}
                    </CardContent>
                  </Card>
                )}


              </div>
      </div>
    </div>
  )
}
