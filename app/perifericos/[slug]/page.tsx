import Link from "next/link"
import { notFound } from "next/navigation"

import { PublicSidebar } from "@/components/layout/PublicSidebar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { buildPeripheralSlug, coercePeripheralId, slugToSearchPattern } from "@/lib/peripheral-slug"

interface PerifericoPageProps {
  params: Promise<{ slug: string }>
}

type PeripheralRow = {
  id: string
  name: string
  brand: string
  category: string
  tier: string
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

  const { data: relatedPosts } = await supabase
    .from("blog_posts")
    .select("id, title, slug, cover_thumbnail_url, cover_image_url, created_at")
    .eq("peripheral_id", data.id)
    .eq("is_published", true)
    .order("created_at", { ascending: false })

  return (
    <div className="min-h-screen bg-background text-foreground pt-16">
      <div className="flex">
        <div className="hidden md:flex md:sticky md:top-16 md:h-[calc(100vh-64px)] md:shrink-0">
          <PublicSidebar />
        </div>

        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 lg:px-8 space-y-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <div className="w-full max-w-sm space-y-4">
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

                {buyLinks.length > 0 && (
                  <Card className="border-border bg-card">
                    <CardHeader className="space-y-1">
                      <CardTitle className="text-sm">Onde comprar</CardTitle>
                      <CardDescription className="text-xs">Links oficiais e lojas recomendadas.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
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

              <div className="flex-1 space-y-4">
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
                    <p className="mt-3 text-sm text-muted-foreground">
                      {details.summary}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Ficha tecnica</CardTitle>
                      <CardDescription className="text-xs">Principais dados do produto.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>Preco base</span>
                        <span className="font-semibold text-foreground">
                          {formatCurrency(data.price)}
                        </span>
                      </div>
                      {specs.connectivity && <div className="flex items-center justify-between"><span>Conectividade</span><span>{formatLabel(specs.connectivity)}</span></div>}
                      {specs.driver && <div className="flex items-center justify-between"><span>Sensor</span><span>{specs.driver}</span></div>}
                      {specs.keyboardLayout && <div className="flex items-center justify-between"><span>Layout</span><span>{String(specs.keyboardLayout).toUpperCase()}</span></div>}
                      {specs.surface && <div className="flex items-center justify-between"><span>Superficie</span><span>{formatLabel(specs.surface)}</span></div>}
                      {specs.size && <div className="flex items-center justify-between"><span>Tamanho</span><span>{formatLabel(specs.size)}</span></div>}
                      {specs.profile && <div className="flex items-center justify-between"><span>Perfil</span><span>{specs.profile}</span></div>}
                    </CardContent>
                  </Card>

                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Destaques</CardTitle>
                      <CardDescription className="text-xs">Resumo rapido do que importa.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      {highlights.length > 0 ? (
                        <ul className="list-disc space-y-2 pl-4">
                          {highlights.map((item: string) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>Nenhum destaque cadastrado.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Pontos fortes</CardTitle>
                      <CardDescription className="text-xs">O que este periferico faz bem.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      {pros.length > 0 ? (
                        <ul className="list-disc space-y-2 pl-4">
                          {pros.map((item: string) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>Sem pontos fortes cadastrados.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Pontos fracos</CardTitle>
                      <CardDescription className="text-xs">Aspectos que podem melhorar.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      {cons.length > 0 ? (
                        <ul className="list-disc space-y-2 pl-4">
                          {cons.map((item: string) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>Sem pontos fracos cadastrados.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Compatibilidade</CardTitle>
                      <CardDescription className="text-xs">Plataformas, softwares e requisitos.</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {details.compatibility ? details.compatibility : "Informacao de compatibilidade nao cadastrada."}
                    </CardContent>
                  </Card>

                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Notas e observacoes</CardTitle>
                      <CardDescription className="text-xs">Detalhes extras da equipe.</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {details.notes ? details.notes : "Sem observacoes adicionais."}
                    </CardContent>
                  </Card>
                </div>

                {comparisons.length > 0 && (
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Comparacoes</CardTitle>
                      <CardDescription className="text-xs">Alternativas diretas para avaliar.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
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
                  <CardContent className="space-y-3">
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
        </main>
      </div>

      <div className="md:hidden">
        <PublicSidebar />
      </div>
    </div>
  )
}
