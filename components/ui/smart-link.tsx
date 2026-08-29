"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Award,
  ExternalLink,
  Flame,
  Keyboard,
  ListOrdered,
  MessageSquare,
  Newspaper,
  PenLine,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Store,
  Trophy,
  User,
  Youtube,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { classifyLink, type InternalSection } from "@/lib/link-target"

/** Ícone da seção de destino, exibido dentro da pílula do link interno. */
const SECTION_ICON: Record<InternalSection, typeof MessageSquare> = {
  forum: MessageSquare,
  loja: ShoppingBag,
  perifericos: Keyboard,
  perfil: User,
  blog: PenLine,
  noticias: Newspaper,
  mercado: Store,
  ranking: Trophy,
  aura: Sparkles,
  tierlist: ListOrdered,
  videos: Youtube,
  conquistas: Award,
  site: Flame,
}

/**
 * Link escrito por um usuário (post do fórum, comentário, descrição de produto),
 * exibido conforme o destino:
 *
 * - **Interno** (sunano.com.br ou caminho relativo): pílula com o ícone da seção
 *   de destino e o nome dela, navegando client-side pelo `next/link` — o link
 *   parece parte do site em vez de um endereço colado no meio do texto.
 * - **Externo**: sublinhado tracejado + ícone de saída, e o clique abre um aviso
 *   com o domínio de destino antes de abrir. Quem escreveu o post não decide
 *   sozinho pra onde o leitor vai: o leitor confirma.
 *
 * Esquema que não seja http(s) (`javascript:`, `data:`) não vira link — sai como
 * texto puro, então um post não consegue produzir uma âncora executável.
 */
export function SmartLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const target = classifyLink(href)

  // O parser usa a própria URL como texto quando ela foi digitada solta (sem
  // `[texto](url)`). Nesse caso o endereço cru não acrescenta nada dentro da
  // pílula — o rótulo da seção ("Fórum", "Loja") diz melhor para onde vai.
  // Com `[texto](url)` o texto é escolha de quem escreveu e é mantido.
  const isBareUrl = typeof children === "string" && children === href.trim()

  if (target.kind === "internal") {
    const Icon = SECTION_ICON[target.section]
    return (
      <Link
        href={target.href}
        title={`Ir para ${target.label} — ${target.href}`}
        className="mx-0.5 inline-flex max-w-full items-baseline gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 align-baseline font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/20"
      >
        <Icon aria-hidden className="size-3 shrink-0 self-center" />
        <span className="truncate">{isBareUrl ? target.label : children}</span>
      </Link>
    )
  }

  // Sem hostname = URL inválida ou esquema não-http: exibe o texto, sem link.
  if (!target.hostname) return <>{children}</>

  return (
    <>
      <a
        href={target.href}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        title={`Link externo — ${target.hostname}`}
        onClick={(event) => {
          // Ctrl/Cmd/meio: o usuário já escolheu abrir em outra aba
          // conscientemente, o aviso só atrapalharia.
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
          event.preventDefault()
          event.stopPropagation()
          setConfirmOpen(true)
        }}
        className="inline-flex items-baseline gap-0.5 break-all text-foreground underline decoration-dashed decoration-muted-foreground/60 underline-offset-2 transition-colors hover:text-primary hover:decoration-primary"
      >
        {/* Link externo mostra o endereço como foi escrito — encurtar para só
            o domínio esconderia justamente o que o leitor precisa conferir
            antes de decidir sair do site. */}
        {children}
        <ExternalLink aria-hidden className="size-3 shrink-0 self-center text-muted-foreground" />
      </a>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent
          // O corpo do post costuma ser clicável (o card inteiro abre o post);
          // sem isso o clique dentro do aviso vazaria pro card por trás.
          onClick={(event) => event.stopPropagation()}
        >
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-amber-500/15 text-amber-500">
              <ShieldAlert />
            </AlertDialogMedia>
            <AlertDialogTitle>Você está saindo do Sunano</AlertDialogTitle>
            <AlertDialogDescription>
              Este link leva para um site externo, que não é controlado nem verificado pelo Sunano.
              Confira o endereço antes de continuar e nunca informe sua senha fora daqui.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Destino
            </p>
            <p className="text-sm font-medium text-foreground">{target.hostname}</p>
            <p className="mt-0.5 break-all text-xs text-muted-foreground">{target.href}</p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Ficar no Sunano</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => window.open(target.href, "_blank", "noopener,noreferrer")}
            >
              Abrir link externo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
