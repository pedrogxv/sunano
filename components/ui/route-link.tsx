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
}

function openInNewTab(href: string) {
  window.open(href, "_blank", "noopener")
}

function RouteLink({
  href,
  target,
  replace = false,
  scroll,
  className,
  role,
  tabIndex,
  onClick,
  onAuxClick,
  onMouseDown,
  onKeyDown,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: RouteLinkProps) {
  const router = useRouter()

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
      onClick={(e) => {
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
