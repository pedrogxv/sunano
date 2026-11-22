"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"

/**
 * Navegação para elementos com cara de BOTÃO (Button, item de menu, sidebar,
 * atalho da TopBar). Sem `href`, o navegador não mostra a URL no canto da tela
 * ao passar o mouse, que é o que o `<Link>` faz em todo `<a>`.
 *
 * Link de CONTEÚDO (card de produto, post, perfil, notícia, item de ranking)
 * continua sendo `<Link>`: o Google descobre as páginas por ele e a pessoa
 * espera poder abrir em nova aba pelo menu do botão direito.
 *
 * O que o `<Link>` dava de graça e este repõe à mão:
 *  - Ctrl/Cmd/Shift+clique e clique do meio abrem em nova aba;
 *  - pré-carrega a rota no hover/foco/toque, para o clique seguir instantâneo;
 *  - `role="link"` + Enter no teclado.
 *
 * E o que o `AppFastLinkRegion` (layout raiz) dá a todo `<a>`, mas não
 * alcança aqui por ser `<span>`: o clique primário do mouse navega no APERTO
 * (`pointerdown`), não no soltar. O `onClick` de quem usa roda nesse momento
 * (fechar menu, marcar como visto, `preventDefault()` cancelando), porque a
 * página nova pode desmontar o item antes de o botão ser solto; o clique que
 * chega depois é engolido, para não rodar duas vezes. Passe
 * `pressNavigation={false}` se o `onClick` só pode decidir no soltar.
 *
 * Renderiza `<span>`, não `<button>`: o item da Loja na sidebar tem o botão do
 * carrinho DENTRO dele, e botão dentro de botão é HTML inválido. Funciona como
 * filho de `<Button asChild>` e `<DropdownMenuItem asChild>` (o `role` e o
 * `tabIndex` que eles passam têm precedência). Um `onClick` que chama
 * `preventDefault()` cancela a navegação, igual ao `<Link>`.
 */
type RouteLinkProps = Omit<React.ComponentProps<"span">, "href"> & {
  href: string
  /** `"_blank"` abre sempre em nova aba, como no `<a target>`. */
  target?: "_blank" | "_self"
  replace?: boolean
  scroll?: boolean
  /** `false` mantém a navegação no soltar do clique. */
  pressNavigation?: boolean
}

/** Controle DENTRO do item (o carrinho no item da Loja): o aperto é dele. */
const NESTED_CONTROL = 'button, a, input, select, textarea, label, [role="button"], [data-no-fast-link]'

function openInNewTab(href: string) {
  window.open(href, "_blank", "noopener")
}

function RouteLink({
  href,
  target,
  replace = false,
  scroll,
  pressNavigation = true,
  className,
  role,
  tabIndex,
  onClick,
  onAuxClick,
  onMouseDown,
  onPointerDown,
  onKeyDown,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: RouteLinkProps) {
  const router = useRouter()
  // Este aperto já navegou: o `click` que vem ao soltar não navega de novo.
  const pressHandledRef = React.useRef(false)
  // ...e repete o `stopPropagation()` que o `onClick` fez no aperto (item
  // dentro de linha clicável), senão o clique engolido chegaria à linha.
  const pressStoppedRef = React.useRef(false)

  const navigate = () => {
    const options = scroll === undefined ? undefined : { scroll }
    if (replace) router.replace(href, options)
    else router.push(href, options)
  }

  const prefetch = () => {
    router.prefetch(href)
  }

  return (
    <span
      role={role ?? "link"}
      tabIndex={tabIndex ?? 0}
      className={cn("cursor-pointer", className)}
      onPointerDown={(e) => {
        pressHandledRef.current = false
        onPointerDown?.(e)
        if (!pressNavigation || e.defaultPrevented) return
        if (e.pointerType !== "mouse" || e.button !== 0) return
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || target === "_blank") return
        const control = e.target instanceof Element ? e.target.closest(NESTED_CONTROL) : null
        if (control && control !== e.currentTarget && e.currentTarget.contains(control)) return
        pressHandledRef.current = true
        // O evento de ponteiro É um MouseEvent: o handler de clique recebe o
        // aperto e pode cancelar com `preventDefault()`, como faria no clique.
        onClick?.(e)
        pressStoppedRef.current = e.isPropagationStopped()
        if (!e.defaultPrevented) navigate()
      }}
      onClick={(e) => {
        // `detail === 0` é clique de teclado (Enter): nunca é o soltar do aperto.
        if (pressHandledRef.current && e.detail > 0) {
          pressHandledRef.current = false
          e.preventDefault()
          if (pressStoppedRef.current) e.stopPropagation()
          return
        }
        pressHandledRef.current = false
        onClick?.(e)
        if (e.defaultPrevented) return
        e.preventDefault()
        if (target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey) openInNewTab(href)
        else navigate()
      }}
      onAuxClick={(e) => {
        onAuxClick?.(e)
        if (e.defaultPrevented || e.button !== 1) return
        e.preventDefault()
        openInNewTab(href)
      }}
      onMouseDown={(e) => {
        onMouseDown?.(e)
        // Clique do meio num elemento que não é link liga a rolagem automática
        // do navegador em vez de disparar o auxclick.
        if (e.button === 1) e.preventDefault()
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        // Enter num botão DENTRO do item (o carrinho no item da Loja) é dele.
        if (e.defaultPrevented || e.key !== "Enter" || e.target !== e.currentTarget) return
        e.preventDefault()
        e.currentTarget.click()
      }}
      onMouseEnter={(e) => {
        onMouseEnter?.(e)
        prefetch()
      }}
      onFocus={(e) => {
        onFocus?.(e)
        prefetch()
      }}
      onTouchStart={(e) => {
        onTouchStart?.(e)
        prefetch()
      }}
      {...props}
    />
  )
}

export { RouteLink }
