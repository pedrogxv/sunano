import { cn } from "@/lib/utils"

/**
 * A barra do topo DESACOPLADA: uma ilha de vidro que flutua 8px abaixo da
 * borda, gêmea da sidebar (mesmo respiro, mesmo raio, mesmo material). É a
 * moldura de TODA barra de topo do site — a TopBar e o menu da Loja — para as
 * duas não divergirem em altura, raio ou sombra.
 *
 * - O wrapper (`.topbar-dock`) é o sticky. Ele pinta o fundo da página só nos
 *   8px acima da ilha, então o conteúdo que rola some ali em vez de passar por
 *   cima dela.
 * - A ilha tem altura fixa (`h-14`). `--sticky-header-h` (globals.css) conta
 *   com 8 + 56 + 8px: mudou a altura aqui, mude lá.
 * - Sombra que levanta ao rolar e a linha de progresso são CSS puro
 *   (scroll-driven animation) — nenhum listener de scroll.
 *
 * `overlay` fica DENTRO do sticky, mas fora do vidro: é o lugar do mega menu,
 * que abre ancorado embaixo da ilha (`top-full`) e rola junto com ela.
 */
export function TopBarDock({
  children,
  overlay,
  className,
  glassClassName,
  onMouseLeave,
}: {
  children: React.ReactNode
  overlay?: React.ReactNode
  className?: string
  glassClassName?: string
  onMouseLeave?: () => void
}) {
  return (
    <div
      className={cn("topbar-dock sticky top-0 z-20 px-2 py-2 md:px-0", className)}
      onMouseLeave={onMouseLeave}
    >
      <header
        className={cn(
          "topbar-glass flex h-14 items-center rounded-2xl border border-white/10",
          glassClassName
        )}
      >
        {children}
        <span aria-hidden className="topbar-progress" />
      </header>
      {overlay}
    </div>
  )
}

/**
 * A superfície do conteúdo (o "cartão" escuro ao lado da sidebar). Separada
 * da barra: a Loja a abre DEPOIS do próprio menu, por isso não dá para o
 * LayoutShell embrulhar a página inteira nela.
 *
 * `overflow-clip` e não `overflow-hidden`: recorta o hero no raio do canto sem
 * virar container de rolagem, o que quebraria todo `position: sticky` de
 * dentro (filtros, sidebar do fórum, navegação do produto).
 */
export function ContentSurface({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("content-surface min-w-0 flex-1 overflow-clip rounded-t-2xl bg-card md:rounded-2xl", className)}>
      {children}
    </div>
  )
}
