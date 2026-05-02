"use client"

import { useEffect, useState } from "react"
import { AlertCircle, ExternalLink, Loader2, MessageCircle } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLocale } from "@/lib/locale-context"

type TelegramOffer = {
  id: string
  messageId: number
  text: string
  date: string
  author: string | null
  chatTitle: string | null
  url: string | null
}

type AdminOffersResponse = {
  ok?: boolean
  error?: string
  warning?: string | null
  offers?: TelegramOffer[]
}

export default function AdminOffersPage() {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [offers, setOffers] = useState<TelegramOffer[]>([])

  useEffect(() => {
    loadOffers()
  }, [])

  async function loadOffers() {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch("/api/admin/offers")
      const data = (await response.json().catch(() => null)) as AdminOffersResponse | null

      if (!response.ok || !data?.offers) {
        throw new Error(data?.error ?? (isEnglish ? "Failed to load Telegram offers" : "Erro ao carregar ofertas do Telegram"))
      }

      setOffers(data.offers)
      setWarning(data.warning ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to load Telegram offers" : "Erro ao carregar ofertas do Telegram"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{isEnglish ? "Offers" : "Ofertas"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEnglish
            ? "Offers are now synced directly from Telegram group messages. Manual create/edit has been disabled."
            : "As ofertas agora são sincronizadas diretamente das mensagens do grupo no Telegram. Cadastro/edição manual foi desativado."}
        </p>
      </div>

      {error ? (
        <Alert className="border-red-500/30 bg-red-500/10">
          <AlertCircle className="size-4 text-red-300" />
          <AlertDescription className="text-red-200">{error}</AlertDescription>
        </Alert>
      ) : null}

      {warning ? (
        <Alert className="border-amber-500/30 bg-amber-500/10">
          <AlertCircle className="size-4 text-amber-300" />
          <AlertDescription className="text-amber-200">{warning}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-14">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span>{isEnglish ? "Loading Telegram offers..." : "Carregando ofertas do Telegram..."}</span>
          </div>
        </div>
      ) : offers.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="py-8 text-sm text-muted-foreground">
            {isEnglish ? "No Telegram messages found for offers." : "Nenhuma mensagem de oferta encontrada no Telegram."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {offers.map((offer) => (
            <Card key={offer.id} className="border-border bg-card">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="line-clamp-2 text-base text-foreground">
                    {offer.chatTitle || (isEnglish ? "Telegram Offer" : "Oferta Telegram")}
                  </CardTitle>
                  <MessageCircle className="size-4 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(offer.date).toLocaleString("pt-BR")}
                  {offer.author ? ` · ${offer.author}` : ""}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{offer.text}</p>
                {offer.url ? (
                  <a href={offer.url} target="_blank" rel="noreferrer" className="block">
                    <Button className="w-full" size="sm" variant="outline">
                      <ExternalLink className="mr-2 size-4" />
                      {isEnglish ? "Open in Telegram" : "Abrir no Telegram"}
                    </Button>
                  </a>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
