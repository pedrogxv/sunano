import Link from "next/link"
import { notFound } from "next/navigation"
import { Star } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { buildPeripheralSlug, coercePeripheralId, slugToSearchPattern } from "@/lib/peripheral-slug"
import { mapTier } from "@/lib/tier-utils"

interface PerifericoPageProps {
  params: Promise<{ slug: string }>
}

type PeripheralRow = {
  id: string
  name: string
  brand: string
  category: string
  tier: string | null
  price: number
  image_url: string | null
  tags: string[]
  specs: Record<string, any> | null
}

function formatLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatCurrency(value: number) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
  } catch (error) {
    return `R$${value}`
  }
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

function RatingStars({ rating, max = 6 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, index) => (
        <Star
          key={index}
          className={
            index < rating
              ? "size-3 fill-amber-400 text-amber-400"
              : "size-3 fill-muted-foreground/30 text-muted-foreground/30"
          }
        />
      ))}
    </div>
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
  const supabase = await createSupabaseServerClient()
  const slug = decodeURIComponent(resolvedParams.slug)
  const idFromSlug = coercePeripheralId(slug)
  const baseSlug = slug.split("--")[0]

  let data: PeripheralRow | null = null

  if (idFromSlug) {
    const { data: byId, error: byIdError } = await supabase
      .from("peripherals")
      .select("*")
      .eq("id", idFromSlug)
      .maybeSingle()

    if (byIdError) {
      console.error("Peripherals lookup by id failed:", { idFromSlug, slug, error: byIdError })
    }

    data = (byId ?? null) as PeripheralRow | null
  }

  if (!data) {
    const searchPattern = slugToSearchPattern(baseSlug)
    const { data: byName, error: byNameError } = await supabase
      .from("peripherals")
      .select("*")
      .ilike("name", searchPattern)
      .limit(1)

    if (byNameError) {
      console.error("Peripherals lookup by name failed:", { baseSlug, searchPattern, slug, error: byNameError })
    }

    data = (byName?.[0] ?? null) as PeripheralRow | null
  }

  if (!data) {
    notFound()
  }

  const specs = (data.specs ?? {}) as Record<string, any>
  const details = (specs.details ?? {}) as Record<string, any>

  const gallery = Array.isArray(details.gallery) ? details.gallery : splitLines(details.gallery)
  const pros = Array.isArray(details.pros) ? details.pros : splitLines(details.pros)
  const cons = Array.isArray(details.cons) ? details.cons : splitLines(details.cons)
  const buyLinks = Array.isArray(details.buyLinks) ? details.buyLinks : parseLinkLines(details.buyLinks)
  const comparisons = Array.isArray(details.comparisons) ? details.comparisons : splitLines(details.comparisons)
  const highlights = Array.isArray(details.highlights) ? details.highlights : splitLines(details.highlights)

  const ratings = {
    overall: normalizeRating(details?.ratings?.overall ?? details.ratingOverall),
    build: normalizeRating(details?.ratings?.build ?? details.ratingBuild),
    software: normalizeRating(details?.ratings?.software ?? details.ratingSoftware),
    battery: normalizeRating(details?.ratings?.battery ?? details.ratingBattery),
    performance: normalizeRating(details?.ratings?.performance ?? details.ratingPerformance),
    qc: normalizeRating(details?.ratings?.qc ?? details.ratingQc),
    value: normalizeRating(details?.ratings?.value ?? details.ratingValue),
  }

  const rankLabel = details.rankLabel || (data.tier ? mapTier(data.tier) : "Sem tier")
  const priceRange = details.priceRange
  const reviewUrl = details.reviewUrl
  const reviewNote = details.reviewNote
  const guideUrl = details.guideUrl
  const notesLong = details.notesLong

  const specsTable = [
    { label: "Preco base", value: formatCurrency(data.price) },
    { label: "Peso", value: details.weight ?? specs.weight },
    { label: "Latencia", value: details.latency ?? specs.latency },
    { label: "Sensor", value: specs.driver ?? details.sensor },
    { label: "Switch", value: details.switchType ?? specs.switchType },
    { label: "Shape", value: details.shape ?? specs.mouseShape },
    { label: "Coating", value: details.coating ?? specs.coating },
  ]

  const gripInfo = [
    { label: "Mao pequena", value: details.gripSmall || "Claw/Palm" },
    { label: "Mao media", value: details.gripMedium || "Claw/Palm" },
    { label: "Mao grande", value: details.gripLarge || "Claw/Finger" },
  ]

  const { data: relatedPosts } = await supabase
    .from("blog_posts")
    .select("id, title, slug, cover_thumbnail_url, cover_image_url, created_at")
    .eq("peripheral_id", data.id)
    .eq("is_published", true)
    .order("created_at", { ascending: false })

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 md:px-6 lg:px-8">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <div className="space-y-3">
                <Card className="border-border bg-card">
                  <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rank</CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-center">
                    <div className="size-16 rounded-full border border-border bg-muted/40 flex items-center justify-center text-xl font-bold text-foreground">
                      {rankLabel}
                    </div>
                  </CardContent>
                </Card>

                <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-muted/40">
                  {data.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={data.name} className="h-full w-full object-cover" src={data.image_url} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-muted-foreground">
                      {data.brand?.slice(0, 2)?.toUpperCase()}
                    </div>
                  )}
                </div>

                {gallery.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {gallery.map((image: string) => (
                      <div key={image} className="aspect-square overflow-hidden rounded-xl border border-border bg-muted/30">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt={data.name} className="h-full w-full object-cover" src={image} />
                      </div>
                    ))}
                  </div>
                )}

                <Card className="border-border bg-card">
                  <CardHeader className="space-y-1">
                    <CardTitle className="text-sm">Notas gerais</CardTitle>
                    <CardDescription className="text-xs">Escala de 0 a 6 (GOAT = 6).</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Geral</span>
                      <RatingStars rating={ratings.overall} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Construcao</span>
                      <RatingStars rating={ratings.build} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Software</span>
                      <RatingStars rating={ratings.software} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Bateria</span>
                      <RatingStars rating={ratings.battery} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Performance</span>
                      <RatingStars rating={ratings.performance} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>QC</span>
                      <RatingStars rating={ratings.qc} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>CxB</span>
                      <RatingStars rating={ratings.value} />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-sm">Notas</CardTitle>
                    <CardDescription className="text-xs">Contexto e observacoes principais.</CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-56 overflow-auto text-sm text-muted-foreground whitespace-pre-wrap">
                    {notesLong || "Sem notas cadastradas."}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-3">
                <div>
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
                    {data.tags?.map((tag) => (
                      <Badge key={tag} variant="outline" className="border-border text-xs text-muted-foreground">
                        {formatLabel(tag)}
                      </Badge>
                    ))}
                  </div>

                  <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                    {data.name}
                  </h1>
                  <p className="text-sm text-muted-foreground">{data.brand}</p>
                  {details.summary && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {details.summary}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Especs</CardTitle>
                      <CardDescription className="text-xs">Principais dados do produto.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      {specsTable.map((row) => (
                        <div key={row.label} className="flex items-center justify-between">
                          <span>{row.label}</span>
                          <span className="font-semibold text-foreground">{formatSpecValue(row.value)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Pegada</CardTitle>
                      <CardDescription className="text-xs">Recomendacao por tamanho de mao.</CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-hidden rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
                      {gripInfo.map((row, index) => (
                        <div
                          key={row.label}
                          className={`grid grid-cols-[1fr_auto] items-center gap-4 px-3 py-2 ${index === 0 ? "" : "border-t border-border"}`}
                        >
                          <span className="text-foreground/80">{row.label}</span>
                          <span className="font-semibold text-foreground">{formatSpecValue(row.value)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Review completa no YouTube</CardTitle>
                      <CardDescription className="text-xs">Conteudo principal do canal.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      {reviewUrl ? (
                        <a
                          href={reviewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/40"
                        >
                          <span>Assistir review</span>
                          <span className="text-primary">→</span>
                        </a>
                      ) : (
                        <p>Nenhum review linkado.</p>
                      )}
                      {reviewNote && <p className="text-xs text-muted-foreground">{reviewNote}</p>}
                    </CardContent>
                  </Card>

                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Guia</CardTitle>
                      <CardDescription className="text-xs">Links e materiais extras.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      {guideUrl ? (
                        <a
                          href={guideUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/40"
                        >
                          <span>Acessar guia</span>
                          <span className="text-primary">→</span>
                        </a>
                      ) : (
                        <p>Nenhum guia cadastrado.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-sm">Comentarios e recomendacoes</CardTitle>
                    <CardDescription className="text-xs">Resumo geral do periférico.</CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-64 overflow-auto space-y-3 text-sm text-muted-foreground">
                    {priceRange && (
                      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                        <span>Faixa de preco</span>
                        <span className="font-semibold text-foreground">{priceRange}</span>
                      </div>
                    )}
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold text-emerald-400">Pontos positivos</p>
                        {pros.length > 0 ? (
                          <ul className="list-disc space-y-1 pl-4">
                            {pros.map((item: string) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>Sem pontos fortes cadastrados.</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-rose-400">Pontos negativos</p>
                        {cons.length > 0 ? (
                          <ul className="list-disc space-y-1 pl-4">
                            {cons.map((item: string) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>Sem pontos fracos cadastrados.</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Software</CardTitle>
                      <CardDescription className="text-xs">Plataformas, softwares e requisitos.</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {details.compatibility ? details.compatibility : "Informacao de compatibilidade nao cadastrada."}
                    </CardContent>
                  </Card>

                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Comentarios</CardTitle>
                      <CardDescription className="text-xs">Detalhes extras da equipe.</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {details.notes ? details.notes : "Sem observacoes adicionais."}
                    </CardContent>
                  </Card>
                </div>

                {highlights.length > 0 && (
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Destaques</CardTitle>
                      <CardDescription className="text-xs">Resumo rapido do que importa.</CardDescription>
                    </CardHeader>
                    <CardContent className="max-h-48 overflow-auto space-y-2 text-sm text-muted-foreground">
                      <ul className="list-disc space-y-2 pl-4">
                        {highlights.map((item: string) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
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

                {comparisons.length > 0 && (
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Comparacoes</CardTitle>
                      <CardDescription className="text-xs">Alternativas diretas para avaliar.</CardDescription>
                    </CardHeader>
                    <CardContent className="max-h-48 overflow-auto space-y-2 text-sm text-muted-foreground">
                      <ul className="list-disc space-y-2 pl-4">
                        {comparisons.map((item: string) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-sm">Reviews e analises</CardTitle>
                    <CardDescription className="text-xs">Artigos e conteudos relacionados.</CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-56 overflow-auto space-y-3">
                    {relatedPosts && relatedPosts.length > 0 ? (
                      relatedPosts.map((post) => (
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
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nenhum review publicado para este periferico.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
      </div>
    </div>
  )
}
