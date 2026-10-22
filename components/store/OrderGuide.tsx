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
 * A arte de cada slide é só o `mascot`: trocar a figurinha não mexe no texto.
 */

const MASCOT = {
  shopping: "/images/mascot/guide/shopping.webp",
  working: "/images/mascot/guide/working.webp",
  digging: "/images/mascot/guide/digging.webp",
  warning: "/images/mascot/guide/warning.webp",
} as const

type GuideSlide = {
  key: string
  /** Rótulo curto da etapa, igual ao do trilho. Ausente = slide de abertura/fechamento. */
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
    title: "Como funciona o seu pedido",
    body: (
      <>
        Do pagamento até a sua casa, cada compra da Loja passa pelas mesmas etapas. Você acompanha
        todas elas no trilho de cada pedido, aqui em Meus Pedidos.
      </>
    ),
    mascot: "shopping",
  },
  {
    key: "payment",
    step: "Pagamento",
    icon: CreditCard,
    title: "Primeiro, o pagamento",
    body: (
      <>
        No PIX a confirmação chega em instantes. No cartão pode levar um pouco mais. Pedido que não é
        pago dentro do prazo expira e os itens voltam para o estoque, mas dá para refazer a compra em
        um clique.
      </>
    ),
    mascot: "shopping",
  },
  {
    key: "address",
    step: "Endereço",
    icon: MapPin,
    title: "Para onde a gente envia?",
    body: (
      <>
        Com o pagamento confirmado, falta o endereço de entrega. Se você não informou no checkout, toque
        em <strong>Informar endereço</strong> no card do pedido. <strong>Sem endereço, nada é
        despachado.</strong>
      </>
    ),
    mascot: "warning",
  },
  {
    key: "placed",
    step: "Pedido feito",
    icon: ClipboardCheck,
    title: "Pedido feito",
    body: (
      <>
        Pagamento e endereço em mãos: agora é com a gente. O seu produto está a caminho do nosso
        armazém. Muitos itens vêm de fora do país, então esta costuma ser a etapa mais longa.
      </>
    ),
    mascot: "working",
  },
  {
    key: "warehouse",
    step: "No armazém",
    icon: Warehouse,
    title: "Chegou no nosso armazém",
    body: (
      <>
        O produto chegou e a gente confere tudo antes de despachar. Você recebe uma notificação quando
        esta etapa acende: o próximo passo já é o envio.
      </>
    ),
    mascot: "digging",
  },
  {
    key: "shipped",
    step: "Enviado",
    icon: Truck,
    title: "Enviado!",
    body: (
      <>
        O código de rastreio aparece no card do pedido. Nos primeiros dias é normal ele ficar sem
        movimentação: espere <strong>cerca de 7 dias</strong> para consultar. Em alguns casos o código
        muda quando a encomenda chega ao Brasil, e a gente atualiza aqui.
      </>
    ),
    mascot: "working",
  },
  {
    key: "delivered",
    step: "Entregue",
    icon: PackageCheck,
    title: "Chegou! Conta pra gente",
    body: (
      <>
        Recebeu? Toque em <strong>Já recebi meu produto</strong> e avalie a compra: você ganha{" "}
        <AuraAmount value={STORE_REVIEW_AURA} size="sm" tone="brand" className="align-middle font-semibold" />, ou{" "}
        <AuraAmount value={STORE_REVIEW_WITH_PHOTO_AURA} size="sm" tone="brand" className="align-middle font-semibold" />{" "}
        com foto.
      </>
    ),
    mascot: "shopping",
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
    mascot: "warning",
  },
]

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
            src={MASCOT.shopping}
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
  const stepSlides = SLIDES.filter((s) => s.step)
  const stepNumber = slide.step ? stepSlides.indexOf(slide) + 1 : null

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
              {stepNumber ? `Etapa ${stepNumber} de ${stepSlides.length} · ${slide.step}` : "Guia da compra"}
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
