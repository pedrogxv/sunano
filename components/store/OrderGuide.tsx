"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import Image from "next/image"
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  MapPin,
  MessageCircle,
  PackageCheck,
  Sparkles,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react"

import { AuraAmount } from "@/components/ui/AuraIcon"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { STORE_REVIEW_AURA, STORE_REVIEW_WITH_PHOTO_AURA } from "@/lib/store-review-aura"
import { cn } from "@/lib/utils"

/**
 * "Como funciona seu pedido": o passo a passo de uma compra da Loja, em
 * slides com a calopsita. Fica no topo de Meus Pedidos porque vale para todo
 * pedido, não para um só; a ideia é levar também para a página de produto.
 *
 * As etapas são as MESMAS do trilho do card (`OrderTimeline`), na mesma
 * ordem e com os mesmos ícones: o guia explica o que o trilho mostra. Etapa
 * nova no trilho entra aqui também, senão o guia promete um caminho diferente
 * do que a pessoa vê no próprio pedido.
 *
 * O roteiro segue a história da calopsita: compra → pedido recebido →
 * encomenda ao armazém da China → compra com o fornecedor → embalagem →
 * viagem → entrega. A arte de cada slide é só o `mascot`: trocar a figurinha
 * não mexe no texto.
 */

const MASCOT = {
  overview: "/images/mascot/guide/overview.webp",
  purchase: "/images/mascot/guide/purchase.webp",
  received: "/images/mascot/guide/order-received.webp",
  sourcing: "/images/mascot/guide/sourcing.webp",
  warehouse: "/images/mascot/guide/warehouse.webp",
  packing: "/images/mascot/guide/packing.webp",
  shipping: "/images/mascot/guide/shipping.webp",
  unboxing: "/images/mascot/guide/unboxing.webp",
} as const

type GuideSlide = {
  key: string
  /**
   * Rótulo curto da etapa, igual ao do trilho. Ausente = slide de
   * abertura/fechamento. Dois slides podem dividir a mesma etapa (a
   * encomenda ao armazém e a compra com o fornecedor são o mesmo "Pedido
   * feito" no trilho): a contagem "Etapa X de Y" é por etapa, não por slide.
   */
  step?: string
  icon: LucideIcon
  title: string
  body: ReactNode
  mascot: keyof typeof MASCOT
}

const SLIDES: GuideSlide[] = [
  {
    key: "intro",
    icon: Sparkles,
    title: "Muito obrigado pela sua compra!",
    body: (
      <>
        Comprar aqui ajuda o site a continuar de pé. Veja como funciona o caminho do seu pedido, da
        loja até as suas mãos. Você acompanha cada etapa no trilho do pedido, aqui em Meus Pedidos.
      </>
    ),
    mascot: "overview",
  },
  {
    key: "payment",
    step: "Pagamento",
    icon: CreditCard,
    title: "Você faz a compra com a gente",
    body: (
      <>
        No PIX a confirmação chega em instantes. No cartão pode levar um pouco mais. Pedido que não é
        pago dentro do prazo expira e os itens voltam para o estoque, mas dá para refazer a compra em
        um clique.
      </>
    ),
    mascot: "purchase",
  },
  {
    key: "address",
    step: "Endereço",
    icon: MapPin,
    title: "Nós recebemos o seu pedido",
    body: (
      <>
        Pagamento confirmado, o pedido cai direto para a nossa equipe. Só falta saber para onde enviar:
        se você não informou o endereço no checkout, toque em <strong>Informar endereço</strong> no card
        do pedido. <strong>Sem endereço, nada é despachado.</strong>
      </>
    ),
    mascot: "received",
  },
  {
    key: "placed",
    step: "Pedido feito",
    icon: ClipboardCheck,
    title: "Encomendamos no nosso armazém da China",
    body: (
      <>
        Com tudo em mãos, a gente passa o seu pedido para o nosso armazém parceiro na China, que cuida
        da compra lá do outro lado.
      </>
    ),
    mascot: "sourcing",
  },
  {
    key: "sourcing",
    step: "Pedido feito",
    icon: ClipboardCheck,
    title: "O armazém compra com os fornecedores",
    body: (
      <>
        O armazém faz o pedido com os nossos fornecedores ou vendedores e recebe o produto por lá. Esta
        costuma ser a etapa mais longa, porque depende do prazo de cada vendedor.
      </>
    ),
    mascot: "warehouse",
  },
  {
    key: "warehouse",
    step: "No armazém",
    icon: Warehouse,
    title: "Organizamos, empacotamos e enviamos",
    body: (
      <>
        Com o produto no armazém, a gente confere tudo, embala com cuidado e despacha. Você recebe uma
        notificação quando esta etapa acende: o próximo passo já é o envio.
      </>
    ),
    mascot: "packing",
  },
  {
    key: "shipped",
    step: "Enviado",
    icon: Truck,
    title: "Depois de enviado, ele vai até você",
    body: (
      <>
        O código de rastreio aparece no card do pedido. Nos primeiros dias é normal ele ficar sem
        movimentação: espere <strong>cerca de 7 dias</strong> para consultar. Em alguns casos o código
        muda quando a encomenda chega ao Brasil, e a gente atualiza aqui.
      </>
    ),
    mascot: "shipping",
  },
  {
    key: "delivered",
    step: "Entregue",
    icon: PackageCheck,
    title: "E é assim que o produto chega até você",
    body: (
      <>
        Não se esqueça de deixar uma avaliação depois de receber: toque em{" "}
        <strong>Já recebi meu produto</strong> e conte como foi. Você ganha{" "}
        <AuraAmount value={STORE_REVIEW_AURA} size="sm" tone="brand" className="align-middle font-semibold" />, ou{" "}
        <AuraAmount value={STORE_REVIEW_WITH_PHOTO_AURA} size="sm" tone="brand" className="align-middle font-semibold" />{" "}
        com foto.
      </>
    ),
    mascot: "unboxing",
  },
  {
    key: "help",
    icon: MessageCircle,
    title: "Ficou alguma dúvida?",
    body: (
      <>
        Use o <strong>Chat com a loja</strong> no card do pedido. A conversa já chega para a equipe com
        o pedido vinculado, sem precisar explicar de qual compra se trata.
      </>
    ),
    mascot: "received",
  },
]

/** Etapas distintas, na ordem do trilho (slides da mesma etapa contam uma vez). */
const STEPS = [...new Set(SLIDES.flatMap((s) => (s.step ? [s.step] : [])))]

const SEEN_KEY = "sunano:order-guide-seen"

/**
 * Botão em destaque do cabeçalho de Meus Pedidos. Mostra "Novo" até a pessoa
 * abrir o guia uma vez (só neste navegador; sem storage o selo só não some).
 */
function readSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1"
  } catch {
    // Storage bloqueado: segue sem o selo.
    return true
  }
}

const noopSubscribe = () => () => {}

export function OrderGuideButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  // No servidor (e na hidratação) conta como visto: o selo só aparece no
  // cliente, sem divergir do HTML.
  const storedSeen = useSyncExternalStore(noopSubscribe, readSeen, () => true)
  const [openedNow, setOpenedNow] = useState(false)
  const seen = storedSeen || openedNow

  function handleOpen() {
    setOpen(true)
    if (!seen) {
      setOpenedNow(true)
      try {
        window.localStorage.setItem(SEEN_KEY, "1")
      } catch {
        // idem
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "group relative flex w-full shrink-0 items-center gap-3 overflow-hidden rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-background/60 py-2 pl-2 pr-4 text-left backdrop-blur-sm transition-colors hover:border-emerald-400/70 hover:from-emerald-500/30 sm:w-auto",
          className
        )}
      >
        <span className="relative flex size-12 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
          <Image
            src={MASCOT.overview}
            alt=""
            width={48}
            height={48}
            className="size-11 object-contain transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            Como funciona seu pedido
            {!seen && (
              <span className="rounded-full bg-emerald-500 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-black">
                Novo
              </span>
            )}
          </span>
          <span className="block text-xs text-muted-foreground">Do pagamento à entrega, passo a passo</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-emerald-400 transition-transform group-hover:translate-x-0.5" />
      </button>

      <OrderGuideDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export function OrderGuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [index, setIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const slide = SLIDES[index]
  const isFirst = index === 0
  const isLast = index === SLIDES.length - 1
  const stepNumber = slide.step ? STEPS.indexOf(slide.step) + 1 : null

  const go = useCallback((delta: number) => {
    setIndex((current) => Math.min(SLIDES.length - 1, Math.max(0, current + delta)))
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") go(1)
      if (event.key === "ArrowLeft") go(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, go])

  const Icon = slide.icon

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Sempre reabre do começo: quem volta quer a explicação, não o último slide.
        if (!next) setIndex(0)
        onOpenChange(next)
      }}
    >
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-2xl"
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null
        }}
        onTouchEnd={(e) => {
          const start = touchStartX.current
          const end = e.changedTouches[0]?.clientX
          touchStartX.current = null
          if (start == null || end == null) return
          if (Math.abs(end - start) > 50) go(end < start ? 1 : -1)
        }}
      >
        {/* Palco do slide: a figurinha ganha o espaço, como num slide de apresentação. */}
        <div className="relative grid gap-5 bg-gradient-to-br from-emerald-500/15 via-background to-background p-6 pt-10 sm:grid-cols-[220px_1fr] sm:items-center sm:gap-8 sm:p-8">
          <div className="relative mx-auto flex size-40 items-center justify-center sm:size-[220px]">
            <span aria-hidden className="absolute inset-4 rounded-full bg-emerald-500/20 blur-2xl" />
            <Image
              key={slide.key}
              src={MASCOT[slide.mascot]}
              alt=""
              width={220}
              height={220}
              className="relative size-full object-contain drop-shadow-xl animate-in fade-in-0 zoom-in-90 duration-300"
            />
          </div>

          <div key={slide.key} className="min-w-0 space-y-3 animate-in fade-in-0 slide-in-from-right-3 duration-300">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              <Icon className="size-3" />
              {stepNumber ? `Etapa ${stepNumber} de ${STEPS.length} · ${slide.step}` : "Guia da compra"}
            </span>
            <DialogTitle className="text-xl font-bold tracking-tight sm:text-2xl">{slide.title}</DialogTitle>
            <DialogDescription asChild>
              <p className="text-sm leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
                {slide.body}
              </p>
            </DialogDescription>
          </div>
        </div>

        {/* Trilho em miniatura: as mesmas etapas do card do pedido, com a
            atual acesa. Clicável para pular direto a uma etapa. */}
        <div className="flex items-center justify-center gap-1.5 border-t border-border/60 px-4 pt-4">
          {SLIDES.map((s, i) => {
            const StepIcon = s.icon
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={s.step ?? s.title}
                aria-current={i === index ? "step" : undefined}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border transition-colors",
                  i === index
                    ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                    : i < index
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500/70"
                      : "border-border/60 text-muted-foreground/50 hover:text-muted-foreground"
                )}
              >
                <StepIcon className="size-3.5" />
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-3 p-4">
          <Button type="button" variant="ghost" size="sm" onClick={() => go(-1)} disabled={isFirst} className="gap-1">
            <ChevronLeft className="size-4" />
            Anterior
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {index + 1} / {SLIDES.length}
          </span>
          {isLast ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setIndex(0)
                onOpenChange(false)
              }}
            >
              Entendi
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => go(1)} className="gap-1">
              Próximo
              <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
