"use client"

import { useEffect, useState } from "react"
import { AlertCircle, ExternalLink, Loader2, MessageCircle } from "lucide-react"
import { toast } from "sonner"

import { usePageHeader } from "@/components/providers/page-header-context"

import BoxLoader from "@/components/ui/box-loader"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useT } from "@/lib/use-t"

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
  const t = useT()

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
        throw new Error(data?.error ?? t.admin.offers.failedToLoad)
      }

      setOffers(data.offers)
      setWarning(data.warning ?? null)
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.offers.failedToLoad
      setError(message)
      toast.error(t.admin.offers.failedToLoad, { description: message })
    } finally {
      setLoading(false)
    }
  }

  usePageHeader(t.admin.offers.pageTitle, t.admin.offers.pageDescription)

  return (
    <div className="space-y-6">
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
          <BoxLoader />
        </div>
      ) :offers.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="py-8 text-sm text-muted-foreground">
            {t.admin.offers.noMessages}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {offers.map((offer) => (
            <Card key={offer.id} className="border-border bg-card">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="line-clamp-2 text-base text-foreground">
                    {offer.chatTitle || t.admin.offers.telegramOffer}
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
                      {t.admin.offers.openInTelegram}
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
