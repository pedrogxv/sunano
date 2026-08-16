import type { NextFetchEvent, NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { hasAdminPermission, isWebMaster, type AdminPermissionKey, type AdminProfile } from "@/lib/admin-permissions"
import { isMfaStepUpRequired, sanitizeNextPath, TRUSTED_DEVICE_COOKIE_NAME, TWO_FACTOR_PATH } from "@/lib/auth-mfa"
import { isTrustedDevice } from "@/lib/server/repositories/mfa-trusted-devices-repository"
import { updateSession } from "@/lib/server/supabase/middleware-client"

function isMaintenanceEnabled() {
  const value = process.env.MAINTENANCE_MODE ?? process.env.NEXT_PUBLIC_MAINTENANCE_MODE
  return value === "true"
}

// Bloqueia SOMENTE a Loja pública — admin, login/cadastro e o resto do site
// continuam normais. As páginas /loja mostram "em breve" sozinhas (ver
// app/loja/page.tsx e app/loja/[slug]/page.tsx); aqui só falta recusar,
// fechado por padrão, qualquer requisição que crie um pedido novo.
function isStoreMaintenanceEnabled() {
  const value = process.env.STORE_MAINTENANCE_MODE ?? process.env.NEXT_PUBLIC_STORE_MAINTENANCE_MODE
  return value === "true"
}

const STORE_ORDER_WRITE_PATHS = ["/api/store/checkout"]

// Rotas públicas de autenticação que continuam acessíveis mesmo em manutenção,
// para que usuários comuns possam entrar / redefinir senha / concluir o 2FA.
function isPublicAuthRoute(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === TWO_FACTOR_PATH ||
    pathname.startsWith("/auth/")
  )
}

// Caminhos que um usuário com 2FA pendente PODE acessar — concluir o segundo
// fator ou sair. Tudo o mais fica bloqueado até a sessão chegar a `aal2`.
function isMfaPendingAllowedPath(pathname: string) {
  return pathname === TWO_FACTOR_PATH || pathname.startsWith("/auth/")
}

// Caminhos que um usuário com consentimento LGPD pendente PODE acessar —
// aceitar (fica) ou recusar (a própria ação faz logout). Tudo o mais fica
// bloqueado até o aceite ser registrado.
const LGPD_CONSENT_PATH = "/consentimento"
function isLgpdConsentPendingAllowedPath(pathname: string) {
  return pathname === LGPD_CONSENT_PATH || pathname.startsWith("/auth/")
}

// Detecta a presença de cookies de sessão do Supabase (`sb-<ref>-auth-token`)
// sem chamada de rede. Permite pular toda a verificação para visitantes
// anônimos em rotas públicas.
function hasSupabaseSession(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"))
}

function copyCookies(source: NextResponse, destination: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    destination.cookies.set(cookie.name, cookie.value, cookie)
  })
}

// Cookie de atribuição do sistema de afiliados: se `?ref=CODIGO` estiver
// presente, grava por 30 dias — se o checkout acontecer dentro dessa janela,
// a venda é atribuída ao afiliado mesmo sem clicar de novo no link. Sem
// validar o código contra o banco aqui (custo zero por pageview, mesmo
// raciocínio de `trackVisit`); a validação real (existe? está aprovado?)
// acontece no checkout, que é o único lugar que lê este cookie de volta.
// Comportamento last-click-wins: um `?ref=` novo sempre substitui o cookie
// anterior e reseta a janela — padrão de mercado, mais simples de auditar.
const AFFILIATE_REF_COOKIE = "sn_aff_ref"
const AFFILIATE_REF_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
const AFFILIATE_CODE_PATTERN = /^[A-Za-z0-9]{4,20}$/

function captureAffiliateRef(request: NextRequest, response: NextResponse) {
  const ref = request.nextUrl.searchParams.get("ref")
  if (!ref || !AFFILIATE_CODE_PATTERN.test(ref)) return

  response.cookies.set(
    AFFILIATE_REF_COOKIE,
    JSON.stringify({ code: ref, clickedAt: Date.now() }),
    {
      maxAge: AFFILIATE_REF_MAX_AGE_SECONDS,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    }
  )
}

// Nome + valor do cookie que marca "já contabilizado hoje" nesta sessão de
// navegador. `recordVisit` já é idempotente por dia (upsert com
// `ignoreDuplicates`), mas sem esse cookie cada pageview do mesmo visitante
// dispararia um fetch/invocação de function novo só para o Supabase
// descartar a linha duplicada — o cookie evita esse round-trip redundante.
const VISIT_TRACKED_COOKIE = "sn_visit_tracked"

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

// Dispara o registro de visita (dashboard admin) sem bloquear a navegação:
// `event.waitUntil` deixa o fetch terminar em segundo plano depois da
// resposta já ter sido enviada, sem atrasar o visitante nem arriscar ser
// cancelado ao fim da função (diferente de um fetch solto sem await). Só
// para navegação de página (não API, não asset) de visitante anônimo em
// rota pública — é o cenário que este arquivo já isola no early-return.
function trackVisit(request: NextRequest, event: NextFetchEvent, response: NextResponse) {
  if (request.method !== "GET" || request.nextUrl.pathname.startsWith("/api")) return

  const today = todayIso()
  if (request.cookies.get(VISIT_TRACKED_COOKIE)?.value === today) return

  response.cookies.set(VISIT_TRACKED_COOKIE, today, {
    maxAge: 60 * 60 * 24,
    sameSite: "lax",
    httpOnly: true,
  })

  event.waitUntil(
    fetch(new URL("/api/track-visit", request.url), {
      method: "POST",
      headers: {
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
        "x-real-ip": request.headers.get("x-real-ip") ?? "",
        "user-agent": request.headers.get("user-agent") ?? "",
      },
    }).catch(() => {})
  )
}

// Página mostrada a quem tem perfil administrativo mas nenhuma seção liberada.
// Nunca exige permissão, senão vira destino de redirecionamento inalcançável.
const NO_ACCESS_PATH = "/admin/sem-permissao"

function getRequiredPermission(pathname: string): AdminPermissionKey | null {
  if (pathname === "/admin") return "dashboard_read"
  if (pathname.startsWith("/admin/tierlist/new") || pathname.startsWith("/admin/perifericos/new")) {
    return "peripherals_write"
  }
  if (/^\/admin\/tierlist\/[^/]+$/.test(pathname) || /^\/admin\/perifericos\/[^/]+$/.test(pathname)) {
    // A edição em si (form's onSubmit / API PATCH) já exige peripherals_write —
    // ver app/api/admin/peripherals/[id]/route.ts. Aqui basta peripherals_read
    // pra deixar quem só tem leitura abrir a página em modo somente-leitura,
    // em vez de ser barrado na rota inteira e mandado de volta pro dashboard.
    return "peripherals_read"
  }
  if (pathname.startsWith("/admin/tierlist")) return "peripherals_read"
  if (pathname.startsWith("/admin/perifericos")) return "peripherals_read"
  if (pathname.startsWith("/admin/ranking")) return "peripherals_read"
  if (pathname.startsWith("/admin/brands")) return "brands_read"
  if (pathname.startsWith("/admin/banners")) return "banners_read"
  if (pathname.startsWith("/admin/blog/new") || /^\/admin\/blog\/[^/]+$/.test(pathname)) {
    return "blog_write"
  }
  if (pathname.startsWith("/admin/blog")) return "blog_read"
  if (/^\/admin\/forum\/[^/]+\/edit$/.test(pathname)) return "forum_write"
  if (pathname.startsWith("/admin/forum")) return "forum_read"
  if (pathname.startsWith("/admin/offers/new")) return "offers_write"
  if (pathname.startsWith("/admin/offers")) return "offers_read"
  if (pathname.startsWith("/admin/store/new") || /^\/admin\/store\/[^/]+$/.test(pathname)) {
    return "store_write"
  }
  if (pathname.startsWith("/admin/store")) return "store_read"
  if (pathname.startsWith("/admin/afiliados")) return "affiliates_read"
  if (pathname === NO_ACCESS_PATH) return null
  if (pathname.startsWith("/admin/users")) return null
  if (pathname.startsWith("/admin/settings")) return "settings_read"
  if (pathname.startsWith("/admin/tiers")) return "tiers_read"
  if (pathname.startsWith("/admin/maintenance")) return "maintenance_read"
  return "dashboard_read"
}

// Ordem espelha a navegação da sidebar. Cada permissão precisa bater com a que
// `getRequiredPermission` exige para o mesmo caminho — é isso que garante que o
// destino escolhido abaixo seja sempre acessível.
const ADMIN_LANDING_ROUTES: Array<{ path: string; permission: AdminPermissionKey }> = [
  { path: "/admin", permission: "dashboard_read" },
  { path: "/admin/tierlist", permission: "peripherals_read" },
  { path: "/admin/perifericos", permission: "peripherals_read" },
  { path: "/admin/blog", permission: "blog_read" },
  { path: "/admin/forum", permission: "forum_read" },
  { path: "/admin/offers", permission: "offers_read" },
  { path: "/admin/store", permission: "store_read" },
  { path: "/admin/settings", permission: "settings_read" },
  { path: "/admin/maintenance", permission: "maintenance_read" },
]

// Primeira seção que o perfil consegue abrir. Redirecionar sempre para /admin
// causava loop infinito em quem não tem `dashboard_read`.
function resolveLandingPath(profile: AdminProfile | null) {
  const landing = ADMIN_LANDING_ROUTES.find((route) => hasAdminPermission(profile, route.permission))
  return landing?.path ?? NO_ACCESS_PATH
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl
  const isAdminRoute = pathname.startsWith("/admin")
  const isLoginRoute = pathname === "/admin/login"
  const maintenanceMode = isMaintenanceEnabled()
  const isStoreOrderWritePath = STORE_ORDER_WRITE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  const storeMaintenanceMode = isStoreMaintenanceEnabled() && isStoreOrderWritePath

  if (pathname === "/maintenance") {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/admin/maintenance"
    return NextResponse.redirect(redirectUrl)
  }

  // Loja em manutenção — recusa qualquer criação de pedido novo (fechado por
  // padrão: mesmo se o pathname mudar de forma inesperada, o método não-GET
  // sozinho já não seria suficiente pra passar). Navegação/admin/cadastro
  // seguem liberados; /loja mostra "em breve" sozinha (ver app/loja/**).
  // Anônimo (sem cookie de sessão) é recusado aqui mesmo, sem consultar o
  // banco — só quando existe sessão a checagem espera o perfil ser resolvido
  // abaixo, para que um WEB MASTER logado possa passar direto.
  if (storeMaintenanceMode && !hasSupabaseSession(request)) {
    return NextResponse.json(
      { error: "A Loja está temporariamente indisponível para novos pedidos." },
      { status: 503 }
    )
  }

  // Mercado desativado temporariamente — bloqueia a rota pública inteira.
  if (pathname === "/mercado" || pathname.startsWith("/mercado/")) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }

    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = "/"
    homeUrl.search = ""
    return NextResponse.redirect(homeUrl)
  }

  // Visitante anônimo em rota pública (sem manutenção): nada a verificar.
  // O cookie de sessão é a única condição que exige resolver a sessão aqui —
  // necessário para aplicar o 2FA também fora do /admin.
  if (!maintenanceMode && !isAdminRoute && !hasSupabaseSession(request)) {
    const response = NextResponse.next()
    trackVisit(request, event, response)
    captureAffiliateRef(request, response)
    return response
  }

  const { response, user, profile, aal, needsLgpdConsent } = await updateSession(request, {
    needProfile: isAdminRoute || maintenanceMode || storeMaintenanceMode,
  })

  // Loja em manutenção, mas há sessão: só o WEB MASTER passa. Qualquer outro
  // usuário logado (ou perfil ausente) continua recusado.
  if (storeMaintenanceMode && !isWebMaster(profile)) {
    const apiResponse = NextResponse.json(
      { error: "A Loja está temporariamente indisponível para novos pedidos." },
      { status: 503 }
    )
    copyCookies(response, apiResponse)
    return apiResponse
  }
  // Cobre também o caminho autenticado (visitante com sessão clicando num
  // link de afiliado) — o cookie é copiado adiante em todo `redirectResponse`
  // via `copyCookies`, então gravar aqui é suficiente para os dois casos.
  captureAffiliateRef(request, response)

  // ── Aplicação do 2FA (vale para QUALQUER usuário autenticado) ──
  // Sessão em aal1 com fator verificado pendente: a sessão existe mas ainda
  // não vale como autenticada para fins de acesso. Bloqueia tudo até o
  // step-up, exceto a própria página de verificação e as rotas de auth.
  const trustedDevice =
    user && isMfaStepUpRequired(aal)
      ? await isTrustedDevice(user.id, request.cookies.get(TRUSTED_DEVICE_COOKIE_NAME)?.value)
      : false

  if (user && isMfaStepUpRequired(aal) && !trustedDevice && !isMfaPendingAllowedPath(pathname)) {
    if (pathname.startsWith("/api")) {
      const apiResponse = NextResponse.json({ error: "mfa_required" }, { status: 403 })
      copyCookies(response, apiResponse)
      return apiResponse
    }

    const verifyUrl = request.nextUrl.clone()
    verifyUrl.pathname = TWO_FACTOR_PATH
    verifyUrl.search = ""
    verifyUrl.searchParams.set("next", sanitizeNextPath(pathname + request.nextUrl.search))

    const redirectResponse = NextResponse.redirect(verifyUrl)
    copyCookies(response, redirectResponse)
    return redirectResponse
  }

  // Já concluiu o 2FA (ou não tem, ou o dispositivo é confiável) mas está na
  // página de verificação: manda para o destino para não ficar preso numa
  // etapa desnecessária.
  if (user && pathname === TWO_FACTOR_PATH && (!isMfaStepUpRequired(aal) || trustedDevice)) {
    const nextParam = request.nextUrl.searchParams.get("next")
    const destination = request.nextUrl.clone()
    destination.pathname = sanitizeNextPath(nextParam)
    destination.search = ""

    const redirectResponse = NextResponse.redirect(destination)
    copyCookies(response, redirectResponse)
    return redirectResponse
  }

  // ── Aplicação do consentimento LGPD (vale para QUALQUER usuário autenticado) ──
  // Antes, o único gate era um redirect avulso no callback do OAuth — uma vez
  // alcançada `/consentimento`, nada impedia navegar direto para outra URL, e
  // o login por e-mail/senha nem passava por ali. Agora é checado a cada
  // requisição, como o 2FA acima: só aceitar (grava o consentimento) ou
  // recusar (a ação de recusa desloga) liberam o restante do site.
  if (user && needsLgpdConsent && !isLgpdConsentPendingAllowedPath(pathname)) {
    if (pathname.startsWith("/api")) {
      const apiResponse = NextResponse.json({ error: "lgpd_consent_required" }, { status: 403 })
      copyCookies(response, apiResponse)
      return apiResponse
    }

    const consentUrl = request.nextUrl.clone()
    consentUrl.pathname = LGPD_CONSENT_PATH
    consentUrl.search = ""
    consentUrl.searchParams.set("next", sanitizeNextPath(pathname + request.nextUrl.search))

    const redirectResponse = NextResponse.redirect(consentUrl)
    copyCookies(response, redirectResponse)
    return redirectResponse
  }

  if (maintenanceMode && !profile) {
    if (isLoginRoute || isPublicAuthRoute(pathname)) {
      return response
    }

    if (pathname.startsWith("/api")) {
      const apiResponse = NextResponse.json({ error: "Site em manutenção." }, { status: 503 })
      copyCookies(response, apiResponse)
      return apiResponse
    }

    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/admin/login"

    const redirectResponse = NextResponse.redirect(loginUrl)
    copyCookies(response, redirectResponse)
    return redirectResponse
  }

  if (isAdminRoute && !profile && !isLoginRoute) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/admin/login"

    const redirectResponse = NextResponse.redirect(loginUrl)
    copyCookies(response, redirectResponse)
    return redirectResponse
  }

  if (profile && isLoginRoute) {
    const adminUrl = request.nextUrl.clone()
    adminUrl.pathname = "/admin"

    const redirectResponse = NextResponse.redirect(adminUrl)
    copyCookies(response, redirectResponse)
    return redirectResponse
  }

  if (profile && pathname.startsWith("/admin/users") && !isWebMaster(profile)) {
    const adminUrl = request.nextUrl.clone()
    adminUrl.pathname = "/admin"

    const redirectResponse = NextResponse.redirect(adminUrl)
    copyCookies(response, redirectResponse)
    return redirectResponse
  }

  if (profile && isAdminRoute && !isLoginRoute) {
    const requiredPermission = getRequiredPermission(pathname)
    const hasAccess = requiredPermission ? hasAdminPermission(profile, requiredPermission) : true

    if (!hasAccess) {
      const landingUrl = request.nextUrl.clone()
      landingUrl.pathname = resolveLandingPath(profile)

      const redirectResponse = NextResponse.redirect(landingUrl)
      copyCookies(response, redirectResponse)
      return redirectResponse
    }
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff2?)$).*)",
  ],
}