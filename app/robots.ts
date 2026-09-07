import type { MetadataRoute } from "next"

import { SITE_URL } from "@/lib/site-url"


export default function robots(): MetadataRoute.Robots {
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
        // O Mercado está desativado no proxy (redireciona para a home);
        // rastreá-lo só gera redirecionamento e URL descartada.
        "/mercado",
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
