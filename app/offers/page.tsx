"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import { format } from "date-fns"
import { enUS, ptBR } from "date-fns/locale"
import { AlertCircle, ExternalLink, MessageCircle } from "lucide-react"

import BoxLoader from "@/components/ui/box-loader"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useLocale } from "@/components/providers/locale-context"

const URL_REGEX = /(https?:\/\/[^\s]+)/g

function TextWithLinks({ text }: { text: string }) {
  const parts = text.split(URL_REGEX)
  return (
    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </p>
  )
}

type TelegramOfferImage = {
  fileId: string
  width: number | null
  height: number | null
}

type TelegramOffer = {
  id: string
  messageId: number
  text: string
  date: string
  author: string | null
  authorAvatar: TelegramOfferImage | null
  chatTitle: string | null
  url: string | null
  image: TelegramOfferImage | null
}

type OffersApiResponse = {
  ok?: boolean
  error?: string
  warning?: string | null
  offers?: TelegramOffer[]
}

const ITEMS_PER_PAGE = 9

export default function OffersPage() {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [offers, setOffers] = useState<TelegramOffer[]>([])
  const [page, setPage] = useState(1)

  useEffect(() => {
    loadOffers()
  }, [])

  async function loadOffers() {
    try {
      setLoading(true)
      setError(null)
      setWarning(null)

      const response = await fetch("/api/offers")
      const data = (await response.json().catch(() => null)) as OffersApiResponse | null

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

  const totalPages = Math.max(1, Math.ceil(offers.length / ITEMS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pageItems = offers.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)

  const dateLocale = isEnglish ? enUS : ptBR
  const dateFormat = isEnglish ? "MMMM dd, yyyy HH:mm" : "dd 'de' MMMM 'de' yyyy 'às' HH:mm"
  const telegramUrl = "https://t.me/canal_sunano"

  function getInitials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    const first = parts[0]?.[0] ?? ""
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : ""
    return `${first}${last}`.toUpperCase()
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 md:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <MessageCircle className="size-6 text-cyan-300" />
            <h1 className="text-3xl font-black tracking-tight text-slate-50 md:text-4xl">
              {isEnglish ? "Offers from Telegram" : "Ofertas via Telegram"}
            </h1>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]">
          <a href={telegramUrl} target="_blank" rel="noreferrer">
            {isEnglish ? "Join on Telegram" : "Entrar no Telegram"}
            <ExternalLink className="ml-2 size-4" />
          </a>
        </Button>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">📌</span>
          <div className="space-y-1">
            <p className="text-sm font-bold text-amber-300">{isEnglish ? "Disclaimer" : "Isenção"}</p>
            <p className="text-sm leading-relaxed text-slate-400">
              {isEnglish
                ? "Messages are published by third parties and may change at any time."
                : "As mensagens são publicadas por terceiros e podem mudar a qualquer momento."}
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <Alert className="border-red-500/30 bg-red-500/10 py-2 [&>svg]:left-3 [&>svg~*]:pl-7">
          <AlertCircle className="size-3.5 text-red-300" />
          <AlertDescription className="text-xs leading-5 text-red-200">{error}</AlertDescription>
        </Alert>
      ) : null}

      {warning ? (
        <Alert className="border-amber-500/30 bg-amber-500/10 py-2 [&>svg]:left-3 [&>svg~*]:pl-7">
          <AlertCircle className="size-3.5 text-amber-300" />
          <AlertDescription className="text-xs leading-5 text-amber-200">{warning}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-14">
          <BoxLoader />
        </div>
      ) :offers.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] py-16 text-center">
          <p className="text-slate-300">{isEnglish ? "No messages found." : "Nenhuma mensagem encontrada."}</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border/60 bg-card/40">
            <div className="divide-y divide-white/[0.06]">
              {pageItems.map((offer) => (
                <article key={offer.id} className="px-4 py-4 sm:px-5">
                  <div className="flex gap-3">
                    <div className="mt-0.5">
                      {offer.authorAvatar ? (
                        <Image
                          src={`/api/offers/media?fileId=${encodeURIComponent(offer.authorAvatar.fileId)}`}
                          alt={offer.author ?? (isEnglish ? "Telegram user" : "Usuário do Telegram")}
                          width={40}
                          height={40}
                          sizes="40px"
                          className="size-10 rounded-full border border-white/10 object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-xs font-semibold uppercase text-slate-200">
                          {offer.author ? getInitials(offer.author) : "TG"}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="font-semibold text-slate-200">
                          {offer.author ?? (isEnglish ? "Telegram user" : "Usuário do Telegram")}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span>{format(new Date(offer.date), dateFormat, { locale: dateLocale })}</span>
                      </div>

                      {offer.image ? (
                        <div className="overflow-hidden rounded-lg border border-white/10 bg-black/20 w-fit">
                          <Image
                            src={`/api/offers/media?fileId=${encodeURIComponent(offer.image.fileId)}`}
                            alt={isEnglish ? "Telegram offer image" : "Imagem da oferta no Telegram"}
                            width={300}
                            height={300}
                            sizes="(max-width: 300px), 300px"
                            className=" object-cover"
                            unoptimized
                          />
                        </div>
                      ) : null}

                      <TextWithLinks text={offer.text} />

                      {offer.url ? (
                        <a href={offer.url} target="_blank" rel="noopener noreferrer" className="inline-flex">
                          <Button size="sm" variant="outline">
                            <ExternalLink className="mr-2 size-4" />
                            {isEnglish ? "Open in Telegram" : "Abrir no Telegram"}
                          </Button>
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
              >
                {isEnglish ? "Previous" : "Anterior"}
              </Button>
              <span className="px-2 text-sm text-slate-400">
                {safePage} / {totalPages}
              </span>
              <Button
                variant="outline"
                className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]"
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
              >
                {isEnglish ? "Next" : "Próxima"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
