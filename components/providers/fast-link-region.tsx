"use client"

import { FastLinkRegion, type FastNavigationPolicy } from "@fast-link/next"

/**
 * Navegação no APERTAR do mouse, não no soltar (`@fast-link/next`): o intervalo
 * entre pressionar e soltar o botão (~100ms) vira tempo de carregamento da
 * próxima página. Envolve o site inteiro no layout raiz, então todo `<Link>` e
 * `<a href="/...">` interno ganha isso sem mexer na tela.
 *
 * Só o clique PRIMÁRIO do mouse antecipa. Toque, teclado, Ctrl/Cmd/Shift+clique,
 * clique do meio, `target="_blank"`, link externo e só-hash continuam nativos.
 *
 * Quando um link NÃO pode navegar no aperto, marque o `<a>` com
 * `data-no-fast-link`:
 *  - `onClick` que decide SE navega (`preventDefault()` pedindo login, "voltar"
 *    pelo histórico): no aperto ele ainda não rodou;
 *  - `onClick` com efeito que precisa acontecer (marcar como visto) num
 *    componente que a página nova desmonta antes de o botão ser solto;
 *  - link dentro de carrossel arrastável com o mouse: arrastar começa com um
 *    aperto, e o banner navegaria em vez de deslizar;
 *  - `replace` / `scroll={false}` no `<Link>`: a região não enxerga as props
 *    do Link (use `FastLink` de `@fast-link/next`, que as preserva).
 *
 * Elementos com cara de botão usam `RouteLink`, que faz o mesmo à mão (é um
 * `<span>`, a biblioteca só cuida de `<a>`).
 */
export function AppFastLinkRegion({ children }: { children: React.ReactNode }) {
  return <FastLinkRegion navigationPolicy={navigationPolicy}>{children}</FastLinkRegion>
}

/**
 * Caminhos do mesmo domínio que NÃO são páginas do App Router: route handlers
 * (API, retorno de OAuth, feed XML). `router.push` neles tentaria renderizar
 * uma página que não existe; vão por carregamento normal de documento.
 */
export function isDocumentOnlyPath(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return true
  if (pathname === "/auth/callback" || /^\/auth\/[^/]+\/callback$/.test(pathname)) return true
  // Arquivo (merchant-feed.xml, sitemap.xml, robots.txt, PDFs do /public)
  return /\.[a-z0-9]+$/i.test(pathname)
}

const navigationPolicy: FastNavigationPolicy = (intent, proposed) => {
  const { pathname } = new URL(proposed.destination, intent.url)
  return isDocumentOnlyPath(pathname) ? { kind: "document", method: "assign" } : { kind: "router" }
}
