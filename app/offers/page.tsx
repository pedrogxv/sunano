"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import { format, formatDistanceToNow } from "date-fns"
import { enUS, ptBR } from "date-fns/locale"
import { AlertCircle, ExternalLink, MessageCircle, RefreshCw } from "lucide-react"

import BoxLoader from "@/components/ui/box-loader"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useLocale } from "@/components/providers/locale-context"
import { cn } from "@/lib/utils"

// ── Constants ─────────────────────────────────────────────────────────────────

const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g
const URL_TEST_RE = /^https?:\/\//

const ITEMS_PER_PAGE = 9
const NEW_OFFER_MS = 12 * 60 * 60 * 1000
const TELEGRAM_URL = "https://t.me/canal_sunano"

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""
  return `${first}${last}`.toUpperCase()
}

function mediaUrl(fileId: string) {
  return `/api/offers/media?fileId=${encodeURIComponent(fileId)}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TextWithLinks({ text }: { text: string }) {
  const parts = text.split(URL_SPLIT_RE)
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
      {parts.map((part, i) =>
        URL_TEST_RE.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-primary underline underline-offset-2 transition-colors hover:text-primary/75"
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

function LivePill({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1">
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      <span className="text-[11px] font-semibold tracking-wide text-emerald-400">{label}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OffersPage() {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const dateLocale = isEnglish ? enUS : ptBR

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [offers, setOffers] = useState<TelegramOffer[]>([])
  const [page, setPage] = useState(1)

  useEffect(() => { void loadOffers(false) }, [])

  async function loadOffers(isRefresh: boolean) {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true)
      setError(null)
      setWarning(null)
      const res = await fetch("/api/offers")
      const data = (await res.json().catch(() => null)) as OffersApiResponse | null
      if (!res.ok || !data?.offers) {
        throw new Error(data?.error ?? (isEnglish ? "Failed to load offers" : "Erro ao carregar ofertas"))
      }
      setOffers(data.offers)
      setWarning(data.warning ?? null)
      if (isRefresh) setPage(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to load offers" : "Erro ao carregar ofertas"))
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(offers.length / ITEMS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pageItems = offers.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-8 md:px-6">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-card/60 px-6 py-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-sky-500/[0.06] to-transparent" />
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-sky-500/[0.04] blur-3xl" />

        <div className="relative space-y-4">
          <LivePill label={isEnglish ? "Live · Sunano Telegram" : "Ao vivo · Sunano Telegram"} />

          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
                {isEnglish ? "Offers" : "Ofertas"}
              </h1>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => void loadOffers(true)}
                disabled={refreshing || loading}
                title={isEnglish ? "Refresh" : "Atualizar"}
                className="flex size-9 items-center justify-center rounded-xl border border-border/50 bg-muted/20 text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground disabled:opacity-40"
              >
                <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
              </button>
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/25 bg-sky-500/[0.07] px-3 py-2 text-xs font-semibold text-sky-400 transition-all hover:border-sky-500/40 hover:bg-sky-500/[0.12] hover:text-sky-300"
              >
                <MessageCircle className="size-3.5" />
                {isEnglish ? "Join" : "Entrar"}
                <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Disclaimer ───────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-4 py-3">
        <span className="mt-px shrink-0 text-base">📌</span>
        <p className="text-xs leading-relaxed text-amber-200/60">
          {isEnglish
            ? "Messages are published by third parties and may change at any time. Confirm prices before purchasing."
            : "Mensagens publicadas por terceiros e podem mudar. Confirme os preços antes de comprar."}
        </p>
      </div>

      {/* ── Alerts ───────────────────────────────────────────────────────── */}
      {error && (
        <Alert className="border-red-500/30 bg-red-500/10 py-2 [&>svg]:left-3 [&>svg~*]:pl-7">
          <AlertCircle className="size-3.5 text-red-300" />
          <AlertDescription className="text-xs leading-5 text-red-200">{error}</AlertDescription>
        </Alert>
      )}
      {warning && (
        <Alert className="border-amber-500/30 bg-amber-500/10 py-2 [&>svg]:left-3 [&>svg~*]:pl-7">
          <AlertCircle className="size-3.5 text-amber-300" />
          <AlertDescription className="text-xs leading-5 text-amber-200">{warning}</AlertDescription>
        </Alert>
      )}

      {/* ── Feed ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <BoxLoader />
        </div>
      ) : offers.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/40 py-20 text-center">
          <MessageCircle className="mx-auto mb-3 size-10 text-muted-foreground/20" />
          <p className="text-sm font-medium text-foreground">
            {isEnglish ? "No messages found" : "Nenhuma mensagem encontrada"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isEnglish ? "Try again later." : "Tente novamente mais tarde."}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {pageItems.map((offer) => {
              const isNew = Date.now() - new Date(offer.date).getTime() < NEW_OFFER_MS
              const relTime = formatDistanceToNow(new Date(offer.date), { locale: dateLocale, addSuffix: true })
              const fullDate = format(
                new Date(offer.date),
                isEnglish ? "MMMM dd, yyyy 'at' HH:mm" : "dd 'de' MMMM 'de' yyyy 'às' HH:mm",
                { locale: dateLocale }
              )

              return (
                <article
                  key={offer.id}
                  className="overflow-hidden rounded-2xl border border-border/50 bg-card/50 transition-all duration-200 hover:border-border/80 hover:bg-card/70 hover:shadow-lg hover:shadow-black/20"
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
                    <div className="flex min-w-0 items-center gap-3">
                      {/* Avatar */}
                      <div className="shrink-0">
                        {offer.authorAvatar ? (
                          <Image
                            src={mediaUrl(offer.authorAvatar.fileId)}
                            alt={offer.author ?? ""}
                            width={44}
                            height={44}
                            sizes="44px"
                            className="size-11 rounded-full border border-white/10 object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-muted/40 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            {offer.author ? getInitials(offer.author) : "TG"}
                          </div>
                        )}
                      </div>

                      {/* Author + time */}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {offer.author ?? (isEnglish ? "Telegram Channel" : "Canal Telegram")}
                        </p>
                        <p className="text-[11px] text-muted-foreground" title={fullDate}>
                          {relTime}
                        </p>
                      </div>
                    </div>

                    {/* "Novo" badge */}
                    {isNew && (
                      <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                        {isEnglish ? "New" : "Novo"}
                      </span>
                    )}
                  </div>

                  {/* Image */}
                  {offer.image && (
                    <div className="border-y border-border/30 bg-black/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={mediaUrl(offer.image.fileId)}
                        alt={isEnglish ? "Offer image" : "Imagem da oferta"}
                        className="w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}

                  {/* Text */}
                  <div className="px-5 py-4">
                    <TextWithLinks text={offer.text} />
                  </div>

                  {/* Footer */}
                  {offer.url && (
                    <div className="border-t border-border/30 px-5 py-3">
                      <a
                        href={offer.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                      >
                        <MessageCircle className="size-3.5" />
                        {isEnglish ? "Open in Telegram" : "Abrir no Telegram"}
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                  )}
                </article>
              )
            })}
          </div>

          {/* ── Pagination ──────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-2">
              <button
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
                className="flex h-9 items-center gap-1 rounded-lg border border-border/50 bg-muted/20 px-3 text-sm text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
              >
                ← <span className="hidden sm:inline">{isEnglish ? "Prev" : "Ant."}</span>
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-all",
                    p === safePage
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                      : "border border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  )}
                >
                  {p}
                </button>
              ))}

              <button
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
                className="flex h-9 items-center gap-1 rounded-lg border border-border/50 bg-muted/20 px-3 text-sm text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
              >
                <span className="hidden sm:inline">{isEnglish ? "Next" : "Próx."}</span> →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
