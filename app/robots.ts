import type { MetadataRoute } from "next"

import { isMaintenanceEnabled } from "@/lib/maintenance"
import { SITE_URL } from "@/lib/site-url"


// A resposta depende de uma env que muda no meio da janela de manutenção.
// Como rota estática, o robots.txt do último build ficaria servindo do CDN e
// continuaria dizendo `Allow: /` com o site fechado (ou o contrário, depois
// que ele voltasse).
export const dynamic = "force-dynamic"

export default function robots(): MetadataRoute.Robots {
  // Site inteiro em manutenção: toda rota pública vira redirect para
  // `/maintenance`. Manter `Allow: /` convidaria o Google a rastrear centenas
  // de URLs que hoje só redirecionam — o caminho mais curto para perder
  // posição, porque o crawler passa a ver a tela de manutenção no lugar do
  // conteúdo real. Enquanto durar a janela, fechamos tudo.
  //
  // Esta rota NÃO passa pelo proxy (o matcher exclui `robots.txt`), então a
  // checagem precisa estar aqui dentro.
  if (isMaintenanceEnabled()) {
    return { rules: { userAgent: "*", disallow: "/" } }
  }

  return {
    rules: {
      userAgent: "*",
      // `/api` inteiro ficaria bloqueado, e junto com ele `/api/og` — que é
      // de onde vem TODA imagem de preview do site. Facebook, X e LinkedIn
      // respeitam robots.txt ao buscar `og:image`: bloqueado, o card sai sem
      // imagem. Por isso o allow mais específico vem antes.
      allow: ["/", "/api/og"],
      // Rota de área logada, de fluxo de compra ou sem conteúdo indexável.
      // Nenhuma delas declara `noIndex` no metadata, então sem esta lista
      // eram todas rastreáveis — gastando crawl budget e podendo aparecer na
      // SERP como página vazia ou tela de login.
      disallow: [
        "/admin",
        "/api/",
        "/conta",
        "/checkout",
        "/auth",
        "/2fa",
        "/reset-password",
        "/forgot-password",
        // Área do afiliado: painel, extrato e saques são todos privados.
        "/afiliados",
        // Telas de sessão do usuário. `/perfil/<handle>` fica de fora de
        // propósito: o perfil público é conteúdo indexável — só a rota
        // `/perfil` sem handle (redireciona para o próprio perfil) não é.
        "/perfil$",
        "/forum/salvos",
        "/consentimento",
        "/login",
        "/register",
        "/maintenance",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
