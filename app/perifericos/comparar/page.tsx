import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createSupabaseServerClient } from "@/lib/supabase-server"

interface ComparePageProps {
  searchParams: Promise<{ ids?: string }>
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

function renderValue(value?: string | null) {
  return value ? value : "-"
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const resolvedParams = await searchParams
  const supabase = await createSupabaseServerClient()

  const ids = (resolvedParams.ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  const { data: peripherals } = await supabase
    .from("peripherals")
    .select("id, name, brand, image_url, category, tier, price, tags, specs")
    .in("id", ids)

  const items = (peripherals ?? []) as PeripheralRow[]
  const hasEnoughItems = items.length >= 2
  const baseCategory = items[0]?.category
  const categoriesMatch = hasEnoughItems && items.every((item) => item.category === baseCategory)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 lg:px-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Comparar perifericos
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Compare lado a lado apenas modelos da mesma categoria.
          </p>
        </div>
        <Link
          href="/perifericos"
          className="text-sm text-primary transition hover:text-primary/80"
        >
          Voltar
        </Link>
      </div>

      {!hasEnoughItems && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Selecione dois perifericos</CardTitle>
            <CardDescription>
              Volte para a lista e escolha exatamente dois itens para comparar.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {hasEnoughItems && !categoriesMatch && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Categorias diferentes</CardTitle>
            <CardDescription>
              A comparacao exige perifericos da mesma categoria. Volte e selecione dois itens iguais.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {hasEnoughItems && categoriesMatch && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {items.map((item) => {
            const specs = (item.specs ?? {}) as Record<string, any>

            return (
              <Card key={item.id} className="min-w-[280px] border-border bg-card">
                <CardHeader className="space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="size-14 overflow-hidden rounded-xl border border-border bg-muted/40">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt={item.name} className="h-full w-full object-cover" src={item.image_url} />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
                          {item.brand.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-lg text-foreground">{item.name}</CardTitle>
                      <CardDescription className="text-sm">{item.brand}</CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="bg-muted/50 text-xs text-muted-foreground">
                      {formatLabel(item.category)}
                    </Badge>
                    <Badge className="bg-primary/15 text-xs text-primary">{item.tier ?? "Sem tier"}</Badge>
                    {item.tags?.map((tag) => (
                      <Badge key={tag} variant="outline" className="border-border text-xs text-muted-foreground">
                        {formatLabel(tag)}
                      </Badge>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Preco base</span>
                    <span className="font-semibold text-foreground">{formatCurrency(item.price)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Conectividade</span>
                    <span>{renderValue(specs.connectivity ? formatLabel(specs.connectivity) : null)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Sensor</span>
                    <span>{renderValue(specs.driver ?? null)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Layout</span>
                    <span>{renderValue(specs.keyboardLayout ? String(specs.keyboardLayout).toUpperCase() : null)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Superficie</span>
                    <span>{renderValue(specs.surface ? formatLabel(specs.surface) : null)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Tamanho</span>
                    <span>{renderValue(specs.size ? formatLabel(specs.size) : null)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Perfil</span>
                    <span>{renderValue(specs.profile ?? null)}</span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
