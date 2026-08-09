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

// Dispara o registro de visita (dashboard admin) sem bloquear a navegação:
// `event.waitUntil` deixa o fetch terminar em segundo plano depois da
// resposta já ter sido enviada, sem atrasar o visitante nem arriscar ser
// cancelado ao fim da função (diferente de um fetch solto sem await). Só
// para navegação de página (não API, não asset) de visitante anônimo em
// rota pública — é o cenário que este arquivo já isola no early-return.
function trackVisit(request: NextRequest, event: NextFetchEvent) {
  if (request.method !== "GET" || request.nextUrl.pathname.startsWith("/api")) return

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
  if (
    pathname.startsWith("/admin/tierlist/new") ||
    /^\/admin\/tierlist\/[^/]+$/.test(pathname) ||
    pathname.startsWith("/admin/perifericos/new") ||
    /^\/admin\/perifericos\/[^/]+$/.test(pathname)
  ) {
    return "peripherals_write"
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

  if (pathname === "/maintenance") {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/admin/maintenance"
    return NextResponse.redirect(redirectUrl)
  }

  // Visitante anônimo em rota pública (sem manutenção): nada a verificar.
  // O cookie de sessão é a única condição que exige resolver a sessão aqui —
  // necessário para aplicar o 2FA também fora do /admin.
  if (!maintenanceMode && !isAdminRoute && !hasSupabaseSession(request)) {
    trackVisit(request, event)
    return NextResponse.next()
  }

  const { response, user, profile, aal, needsLgpdConsent } = await updateSession(request, {
    needProfile: isAdminRoute || maintenanceMode,
  })

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
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|pagefind|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff2?)$).*)",
  ],
}