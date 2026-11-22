"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { Drawer } from "vaul"
import { Loader2, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/lib/hooks/use-media-query"
import { applyPointerOrigin } from "@/lib/client/pointer-origin"
import { Button } from "@/components/ui/button"

/**
 * O modal do site. Use este em vez de montar `Dialog` + `DialogHeader` +
 * `DialogFooter` à mão: era assim que cada tela tinha o seu `max-h`, o seu
 * `overflow` e o seu rodapé, e cada uma quebrava de um jeito (card estourando
 * a largura, X rolando para fora, rodapé sumindo embaixo do conteúdo).
 *
 *   • DESKTOP — diálogo central que NASCE DE ONDE A PESSOA CLICOU: a escala
 *     de entrada parte do ponto do clique, então o painel parece sair do
 *     botão/card em vez de surgir do nada no meio da tela.
 *   • CELULAR — gaveta que sobe da borda de baixo (vaul): alcançável com o
 *     polegar, arrasta para fechar, respeita a área segura do iPhone.
 *     `layout="center"` mantém o diálogo central também no celular — é o das
 *     confirmações curtas, que podem abrir POR CIMA de uma gaveta.
 *
 * Estrutura fixa: cabeçalho (o X nunca rola para fora) → corpo que rola →
 * `AdaptiveDialogFooter` grudado no fundo, sempre à vista. O corpo é
 * `overflow-x-hidden` com coluna `minmax(0, 1fr)`: conteúdo largo encolhe ou
 * quebra, nunca cria rolagem lateral. Animação respeita
 * `prefers-reduced-motion`.
 *
 * Formulário: o `<form id>` fica no corpo e o botão de enviar no rodapé, com
 * `form="<id>"` — ou o rodapé dentro do próprio `<form>`, que também gruda.
 */

export type AdaptiveDialogTone = "neutral" | "emerald" | "amber" | "sky" | "violet" | "teal" | "orange" | "red"

const TONE: Record<AdaptiveDialogTone, { glow: string; icon: string }> = {
  neutral: { glow: "from-foreground/[0.06]", icon: "bg-foreground/10 text-foreground" },
  emerald: { glow: "from-emerald-500/20", icon: "bg-emerald-500/15 text-emerald-400" },
  amber: { glow: "from-amber-500/20", icon: "bg-amber-500/15 text-amber-400" },
  sky: { glow: "from-sky-500/20", icon: "bg-sky-500/15 text-sky-400" },
  violet: { glow: "from-violet-500/20", icon: "bg-violet-500/15 text-violet-300" },
  teal: { glow: "from-teal-500/20", icon: "bg-teal-500/15 text-teal-300" },
  orange: { glow: "from-orange-500/15", icon: "bg-orange-500/15 text-orange-400" },
  red: { glow: "from-red-500/15", icon: "bg-red-500/15 text-red-400" },
}

const SIZE = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
} as const

export type AdaptiveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  /** Ícone do título, num quadradinho na cor do `tone`. */
  icon?: React.ReactNode
  /** Faixa acima do título (selo de status, preço). */
  eyebrow?: React.ReactNode
  /** Cor do brilho do cabeçalho e do quadradinho do ícone. */
  tone?: AdaptiveDialogTone
  size?: keyof typeof SIZE
  /** `center` = diálogo central também no celular (confirmações). */
  layout?: "adaptive" | "center"
  /** `alertdialog` para confirmações: o leitor de tela anuncia como alerta. */
  role?: "dialog" | "alertdialog"
  children: React.ReactNode
  className?: string
}

export function AdaptiveDialog(props: AdaptiveDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)", true)
  return isDesktop || props.layout === "center" ? <CenterDialog {...props} /> : <MobileSheet {...props} />
}

function HeaderGlow({ tone }: { tone: AdaptiveDialogTone }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b to-transparent opacity-90",
        TONE[tone].glow
      )}
    />
  )
}

function TitleIcon({ icon, tone }: { icon: React.ReactNode; tone: AdaptiveDialogTone }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[18px]",
        TONE[tone].icon
      )}
    >
      {icon}
    </span>
  )
}

/**
 * Corpo rolável. O rolador é um BLOCO e o grid fica DENTRO dele, com altura
 * livre: um grid de altura fixa (o rolador) encolhe as linhas até o mínimo
 * de cada filho quando o conteúdo passa da tela, e filho com
 * `overflow: hidden` (todo texto `truncate`) tem mínimo zero — a linha
 * sumia. As variáveis `--dlg-px`/`--dlg-pb` deixam o rodapé sangrar até a
 * borda com o mesmo recuo do corpo, nos dois layouts.
 */
function ScrollBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-[var(--dlg-px)] pb-[var(--dlg-pb)]",
        className
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">{children}</div>
    </div>
  )
}

/**
 * Rodapé de ações, GRUDADO no fundo do modal enquanto o corpo rola: o botão
 * de enviar nunca fica escondido embaixo de um formulário comprido. No
 * celular os botões ocupam a largura toda, com a ação principal embaixo
 * (perto do polegar); no desktop ficam à direita.
 *
 * `bottom` é NEGATIVO no tamanho do padding do corpo: o navegador gruda o
 * sticky na borda do CONTEÚDO do rolador (descontado o padding), e com
 * `bottom-0` sobrava uma faixa vazia embaixo do rodapé.
 */
export function AdaptiveDialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "sticky bottom-[calc(var(--dlg-pb)*-1)] z-10 -mx-[var(--dlg-px)] -mb-[var(--dlg-pb)] mt-1 flex flex-col-reverse gap-2 border-t border-border/60 bg-popover/95 px-[var(--dlg-px)] pt-3 pb-[var(--dlg-pb)] backdrop-blur supports-[backdrop-filter]:bg-popover/80 sm:flex-row sm:items-center sm:justify-end [&>*]:w-full sm:[&>*]:w-auto",
        className
      )}
    >
      {children}
    </div>
  )
}

function CenterDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  eyebrow,
  tone = "neutral",
  size = "lg",
  role,
  children,
  className,
}: AdaptiveDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-200" />
        <DialogPrimitive.Content
          role={role}
          ref={applyPointerOrigin}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[min(88dvh,48rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border/70 bg-popover text-sm text-popover-foreground shadow-2xl shadow-black/50 outline-none [--dlg-pb:1.5rem] [--dlg-px:1.5rem] max-sm:[--dlg-pb:1.25rem] max-sm:[--dlg-px:1.25rem]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-60 data-[state=open]:blur-in-4 data-[state=open]:duration-[380ms] data-[state=open]:ease-[cubic-bezier(0.16,1,0.3,1)]",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-90 data-[state=closed]:duration-200 data-[state=closed]:ease-in",
            "motion-reduce:data-[state=open]:zoom-in-100 motion-reduce:data-[state=open]:blur-in-0 motion-reduce:data-[state=closed]:zoom-out-100",
            SIZE[size],
            className
          )}
        >
          <HeaderGlow tone={tone} />
          <div className="relative flex shrink-0 items-start gap-3 px-[var(--dlg-px)] pt-[var(--dlg-pb)] pb-4">
            {icon && <TitleIcon icon={icon} tone={tone} />}
            <div className="min-w-0 flex-1 space-y-1.5">
              {eyebrow}
              <DialogPrimitive.Title className="text-lg leading-tight font-semibold tracking-tight text-balance">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-xs leading-relaxed text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">Detalhes</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="-mt-1 -mr-2 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <XIcon className="size-4" />
              <span className="sr-only">Fechar</span>
            </DialogPrimitive.Close>
          </div>
          <ScrollBody>{children}</ScrollBody>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function MobileSheet({
  open,
  onOpenChange,
  title,
  description,
  icon,
  eyebrow,
  tone = "neutral",
  role,
  children,
}: AdaptiveDialogProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Drawer.Content
          role={role}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border-t border-border/70 bg-popover text-sm text-popover-foreground shadow-2xl outline-none [--dlg-pb:max(1.5rem,env(safe-area-inset-bottom))] [--dlg-px:1.25rem]"
        >
          <HeaderGlow tone={tone} />
          <div aria-hidden className="relative mx-auto mt-2.5 h-1.5 w-11 shrink-0 rounded-full bg-muted-foreground/30" />
          <div className="relative flex shrink-0 items-start gap-3 px-[var(--dlg-px)] pt-3 pb-4">
            {icon && <TitleIcon icon={icon} tone={tone} />}
            <div className="min-w-0 flex-1 space-y-1.5">
              {eyebrow}
              <Drawer.Title className="text-lg leading-tight font-semibold tracking-tight text-balance">{title}</Drawer.Title>
              {description ? (
                <Drawer.Description className="text-xs leading-relaxed text-muted-foreground">{description}</Drawer.Description>
              ) : (
                <Drawer.Description className="sr-only">Detalhes</Drawer.Description>
              )}
            </div>
          </div>
          <ScrollBody>{children}</ScrollBody>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/**
 * Confirmação de ação ("Cancelar este pedido?"). Sempre central, inclusive no
 * celular: abre por cima de gavetas (o cancelar mora dentro do detalhe do
 * pedido) e é curta demais para virar gaveta. Enquanto `onConfirm` roda, os
 * dois botões travam e o modal não fecha; se ele lançar, o modal fica aberto
 * para tentar de novo (o erro é de quem chamou mostrar, em toast).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  tone = "neutral",
  confirmLabel,
  cancelLabel = "Voltar",
  destructive = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  tone?: AdaptiveDialogTone
  confirmLabel: React.ReactNode
  cancelLabel?: React.ReactNode
  destructive?: boolean
  /** Fecha sozinho quando resolve. */
  onConfirm: () => Promise<void> | void
}) {
  const [busy, setBusy] = React.useState(false)

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // Quem chamou já avisou; o modal fica para nova tentativa.
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title={title}
      description={description}
      icon={icon}
      tone={tone}
      size="sm"
      layout="center"
      role="alertdialog"
    >
      <AdaptiveDialogFooter className="border-t-0 pt-0">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          onClick={handleConfirm}
          disabled={busy}
          className="gap-2"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {confirmLabel}
        </Button>
      </AdaptiveDialogFooter>
    </AdaptiveDialog>
  )
}
