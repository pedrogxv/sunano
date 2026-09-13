import type { NextFetchEvent, NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { hasAdminPermission, isWebMaster, type AdminPermissionKey, type AdminProfile } from "@/lib/admin-permissions"
import { isMfaStepUpRequired, sanitizeNextPath, TRUSTED_DEVICE_COOKIE_NAME, TWO_FACTOR_PATH } from "@/lib/auth-mfa"
import {
  IMPERSONATION_ACTIVE_COOKIE,
  IMPERSONATION_ORIGIN_COOKIE,
} from "@/lib/impersonation-shared"
import { isTrustedDevice } from "@/lib/server/repositories/mfa-trusted-devices-repository"
import { hashVisitor, recordVisit } from "@/lib/server/repositories/visits-repository"
import { updateSession } from "@/lib/server/supabase/middleware-client"
import { isMaintenanceEnabled } from "@/lib/maintenance"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"


// Bloqueia SOMENTE a Loja pública — admin, login/cadastro e o resto do site
// continuam normais. As páginas /loja mostram "em breve" sozinhas (ver
// app/loja/page.tsx e app/loja/[slug]/page.tsx); aqui só falta recusar,
// fechado por padrão, qualquer requisição que crie um pedido novo.
//
// Match EXATO, sem prefixo: as sub-rotas de /api/store/checkout são leitura
// (`/payer-info` só devolve nome/CPF/endereço do próprio perfil, para o card
// "Dados da cobrança"). Um `startsWith(p + "/")` aqui derrubava essa consulta
// com 503 em manutenção, e o checkout — que trata falha da consulta como
// "perfil já está completo" — renderizava o card de cobrança VAZIO, sem nunca
// pedir nome e CPF. Nenhuma sub-rota cria pedido; se um dia criar, adicione o
// pathname dela nesta lista explicitamente.
const STORE_ORDER_WRITE_PATHS = ["/api/store/checkout"]

// O Programa de Afiliados acompanha a manutenção da Loja: sem loja aberta não
// existe venda para comissionar, então a área inteira (páginas e API) fecha
// para todo mundo que não é WEB MASTER. Diferente da Loja, aqui não é só a
// escrita: `/afiliados` não deve nem abrir, porque a proposta da página é
// justamente indicar a loja.
const AFFILIATE_PATHS = ["/afiliados", "/api/afiliados"]

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

// Onde o WEB MASTER sem 2FA é mandado para ativá-lo — a aba "Segurança" de
// /conta (components/account/SecurityTab.tsx), que é a única tela do projeto
// que cadastra TOTP.
const MFA_SETUP_PATH = "/conta"
const MFA_SETUP_HASH = "seguranca"

/**
 * Caminhos que um WEB MASTER sem 2FA ainda PODE acessar — o mínimo para
 * conseguir ativar o fator ou sair da conta. Tudo o mais fica bloqueado.
 *
 * `/conta` é o destino da própria regra (sem ele o redirect vira loop).
 * As rotas de auth e o `/2fa` ficam abertos porque o fluxo de sair/entrar
 * não pode depender de um fator que ainda não existe.
 *
 * O enroll em si (`mfa.enroll`/`challenge`/`verify`) NÃO precisa estar aqui:
 * a SecurityTab fala direto com o Supabase pelo client do browser, sem passar
 * por este proxy. O que precisa passar é o que a página /conta carrega para
 * renderizar — daí `/api/account/`, usado pela aba (contagem de dispositivos
 * confiáveis) e pelo restante da tela.
 *
 * `GET /api/profile` entra pelo mesmo motivo, e a falta dele trancava o
 * webmaster para fora da própria tela de cadastrar TOTP: /conta só monta
 * `AccountSection` (onde vive a SecurityTab) depois que `useOwnProfile`
 * recebe o perfil, e um 403 aqui deixava a página no esqueleto para sempre
 * — sem erro na tela, porque o hook trata "sem perfil" e "falhou" do mesmo
 * jeito. Ver lib/hooks/use-own-profile.ts.
 *
 * Só a LEITURA passa: `POST /api/profile` grava avatar, banner e bio, que
 * não têm nada a ver com ativar o segundo fator. Liberar o método de escrita
 * junto ampliaria o gate para além do que ele precisa permitir.
 */
function isMfaSetupAllowedPath(pathname: string, method: string) {
  return (
    pathname === MFA_SETUP_PATH ||
    pathname === TWO_FACTOR_PATH ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/account/") ||
    pathname === "/api/auth/me" ||
    (pathname === "/api/profile" && (method === "GET" || method === "HEAD"))
  )
}

/**
 * Server Action em voo.
 *
 * O "Sair" do painel (`logoutAction`, em app/admin/actions.ts) é uma Server
 * Action, e uma Server Action é um POST para a URL da PÁGINA ATUAL — não para
 * uma rota própria. Se o webmaster sem 2FA estiver em `/admin` (bloqueada
 * pelo gate), o POST do logout seria interceptado e redirecionado antes de
 * executar: ele não conseguiria nem ativar o 2FA pelo painel, nem sair da
 * conta para entrar com outra. Lockout completo, e sem rota de logout
 * alternativa para contornar.
 *
 * Deixar a action passar não abre brecha: quem faz a triagem do que cada
 * action pode fazer é a própria action (todas as do /admin revalidam sessão e
 * cargo no servidor), e o gate continua bloqueando toda NAVEGAÇÃO — que é o
 * que dá acesso ao painel.
 */
function isServerActionRequest(request: NextRequest) {
  return request.method === "POST" && request.headers.has("next-action")
}

// Tela de aviso pública do modo de manutenção (app/maintenance/page.tsx).
const MAINTENANCE_PATH = "/maintenance"

// Sonda de status usada pelo botão "Tentar novamente" da tela de manutenção.
// Precisa responder mesmo com a manutenção ligada — o gate abaixo devolve 503
// para todo `/api/*`, e sem esta exceção a própria sonda cairia junto e o
// botão nunca conseguiria detectar que o site voltou.
const MAINTENANCE_STATUS_PATH = "/api/maintenance-status"

// Janela estimada que o `Retry-After` anuncia aos crawlers, em segundos.
// Uma hora é deliberadamente conservador: o valor não prende ninguém (nada
// impede o site de voltar antes, e o Google revisita mesmo assim), mas um
// valor curto demais convida o crawler a insistir durante a janela, que é
// exatamente o tráfego que não se quer enquanto o banco está em migração.
const MAINTENANCE_RETRY_AFTER_SECONDS = 3600

/**
 * Headers que toda resposta da janela de manutenção carrega.
 *
 * `Retry-After` é o que transforma o 503 em "temporário" para o Google: sem
 * ele o 503 ainda é tratado como transitório, mas com prazo indefinido e
 * revisita mais lenta.
 *
 * O anti-cache existe porque um 503 guardado pela CDN sobreviveria ao fim da
 * manutenção — o site voltaria e parte dos visitantes (e dos crawlers)
 * continuaria recebendo a tela de fora do ar, que é o pior desfecho possível
 * desta feature. Na prática o Next sobrescreve este valor por
 * `no-cache, must-revalidate` na resposta do rewrite (verificado com
 * `curl -D -`); serve igual, porque `no-cache` também força revalidação a
 * cada request — o que o 503 não pode é ser reutilizado sem perguntar.
 *
 * O `X-Robots-Tag: noindex` é cinto e suspensório: um 503 já não indexa, mas
 * se algum dia esta resposta escapar com status 200 por engano, o header
 * ainda impede a tela de manutenção de entrar no índice no lugar do conteúdo.
 */
function applyMaintenanceHeaders(response: NextResponse) {
  response.headers.set("Retry-After", String(MAINTENANCE_RETRY_AFTER_SECONDS))
  response.headers.set("Cache-Control", "no-store, must-revalidate")
  response.headers.set("X-Robots-Tag", "noindex")
}

// Máquina-a-máquina: precisa continuar funcionando DURANTE a manutenção.
//
// Sem esta exceção o gate devolvia 503 para os três webhooks da Asaas — ou
// seja, um PIX pago no meio da janela não confirmava o pedido — e para os
// quatro crons da Vercel (expiração de pedidos, VIP, limpeza LGPD, ofertas).
// A Asaas reenvia, mas com backoff e por tempo limitado; a Vercel simplesmente
// perde a execução daquela janela.
//
// Não é afrouxamento de segurança: nenhuma destas rotas usa sessão de usuário.
// Os webhooks validam `asaas-access-token` (ASAAS_WEBHOOK_TOKEN) e os crons
// exigem `Authorization: Bearer $CRON_SECRET`, ambos fail-closed quando a env
// não está configurada. O que a manutenção fecha é o site para gente, não a
// integração com quem já se autentica por segredo próprio.
function isMachineToMachinePath(pathname: string) {
  return pathname.startsWith("/api/webhooks/") || pathname.startsWith("/api/cron/")
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
// O `sb-<ref>-auth-token-code-verifier` não conta: ele é gravado por 400 dias
// só por pedir "esqueci minha senha" (o @supabase/ssr força flowType PKCE) e
// não representa sessão nenhuma. Contá-lo fazia todo visitante que um dia
// usou o /forgot-password pagar um `getUser()` de rede em cada pageview.
function hasSupabaseSession(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && !cookie.name.endsWith("-code-verifier"))
}

// Recusa padronizada da manutenção da Loja. Rotas de API respondem 503 em JSON;
// páginas (só o caso dos afiliados, já que a Loja se fecha sozinha em
// app/loja/**) vão para a home, porque devolver JSON cru numa navegação
// deixaria o usuário olhando para um `{"error":...}` sem layout.
function storeMaintenanceResponse(request: NextRequest, isAffiliatePath: boolean) {
  // A mensagem dos afiliados é repetida aqui (e não importada de
  // lib/server/auth/affiliate-access.ts) porque aquele módulo é `server-only`
  // e o proxy não pode importá-lo. Mantenha as duas iguais.
  const message = isAffiliatePath
    ? "O Programa de Afiliados está temporariamente indisponível."
    : "A Loja está temporariamente indisponível para novos pedidos."

  if (request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json({ error: message }, { status: 503 })
  }

  const homeUrl = request.nextUrl.clone()
  homeUrl.pathname = "/"
  homeUrl.search = ""
  return NextResponse.redirect(homeUrl)
}

// Headers anti-cache que o `setAll` de `middleware-client.ts` grava no
// `response` quando um refresh de token emite `Set-Cookie`. Precisam viajar
// JUNTO com os cookies: `copyCookies` move a sessão para um response novo
// (redirect, 503, JSON de erro), e sem isto a resposta que carrega a sessão de
// um usuário sairia cacheável para a CDN — o cenário de vazamento cruzado que
// o comentário do `setAll` descreve.
const NO_STORE_HEADERS = ["cache-control", "expires", "pragma"]

function copyCookies(source: NextResponse, destination: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    destination.cookies.set(cookie.name, cookie.value, cookie)
  })
  NO_STORE_HEADERS.forEach((header) => {
    const value = source.headers.get(header)
    if (value) destination.headers.set(header, value)
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

// Cookie de atribuição do Programa de Indicação: mesma ideia do afiliado
// acima, com duas diferenças que importam.
//
// 1. O parâmetro é `?convite=`, não `?ref=`. Os dois programas coexistem (um
//    paga comissão em dinheiro por venda, o outro Aura por cadastro), e um
//    link pode carregar os dois — se dividissem o mesmo parâmetro, indicar um
//    amigo apagaria a atribuição do afiliado, ou vice-versa.
// 2. O cookie é lido no CADASTRO, não no checkout, e a indicação é gravada
//    como `pending` até o indicado passar por um verificador.
//
// Também last-click-wins, pelo mesmo motivo do afiliado: é o padrão de
// mercado e o mais simples de auditar.
const REFERRAL_REF_COOKIE = "sn_inv_ref"
const REFERRAL_REF_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

function captureReferralRef(request: NextRequest, response: NextResponse) {
  const invite = request.nextUrl.searchParams.get("convite")
  // Mesmo formato de `referral_codes.code` — validação real (existe? é do
  // próprio usuário?) fica no cadastro, único lugar que lê este cookie.
  if (!invite || !AFFILIATE_CODE_PATTERN.test(invite)) return

  response.cookies.set(REFERRAL_REF_COOKIE, invite.toUpperCase(), {
    maxAge: REFERRAL_REF_MAX_AGE_SECONDS,
    sameSite: "lax",
    // httpOnly: o cadastro lê no servidor (server action). Nenhum script de
    // página precisa deste valor.
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })
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

// Registra a visita (dashboard admin) sem bloquear a navegação:
// `event.waitUntil` deixa o trabalho terminar em segundo plano depois da
// resposta já ter sido enviada, sem atrasar o visitante nem arriscar ser
// cancelado ao fim da função. Só para navegação de página (não API, não
// asset) de visitante anônimo em rota pública — é o cenário que este arquivo
// já isola no early-return.
//
// Grava direto pelo repositório em vez de dar um `fetch` em
// /api/track-visit: aquele salto de rede custava uma invocação de function
// inteira por visitante/dia só para chamar uma função que o proxy já podia
// chamar sozinho (o proxy roda no servidor e já importa outros repositórios,
// ex. `isTrustedDevice`). A rota continua existindo e protegida pelo
// `x-internal-token` — não é mais o caminho usado aqui.
function trackVisit(request: NextRequest, event: NextFetchEvent, response: NextResponse) {
  if (request.method !== "GET" || request.nextUrl.pathname.startsWith("/api")) return

  const today = todayIso()
  if (request.cookies.get(VISIT_TRACKED_COOKIE)?.value === today) return

  response.cookies.set(VISIT_TRACKED_COOKIE, today, {
    maxAge: 60 * 60 * 24,
    sameSite: "lax",
    httpOnly: true,
  })

  const forwardedFor = request.headers.get("x-forwarded-for")
  const ip = forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"
  const userAgent = request.headers.get("user-agent") || "unknown"

  // Falha aqui nunca pode afetar a navegação — o dashboard perder uma visita
  // é irrelevante perto de derrubar a página do visitante.
  event.waitUntil(
    Promise.resolve()
      .then(() => recordVisit(hashVisitor(ip, userAgent), today))
      .catch(() => {})
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
  if (pathname.startsWith("/admin/store/banners")) return "store_read"
  if (pathname.startsWith("/admin/store/new") || /^\/admin\/store\/[^/]+$/.test(pathname)) {
    return "store_write"
  }
  if (pathname.startsWith("/admin/store")) return "store_read"
  if (pathname.startsWith("/admin/vips")) return "vip_read"
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
  { path: "/admin/vips", permission: "vip_read" },
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
  const isStoreOrderWritePath = STORE_ORDER_WRITE_PATHS.includes(pathname)
  const isAffiliatePath = AFFILIATE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  const storeMaintenanceMode = isStoreMaintenanceEnabled() && (isStoreOrderWritePath || isAffiliatePath)

  // `/maintenance` é a tela de aviso pública (app/maintenance/page.tsx). Antes
  // isto redirecionava para `/admin/maintenance`, uma rota que nunca existiu —
  // o resultado era 404 e a tela jamais aparecia. Fora da manutenção a página
  // não tem o que dizer, então volta para a home; durante a manutenção ela
  // segue adiante e é liberada no gate lá embaixo.
  if (pathname === MAINTENANCE_PATH && !maintenanceMode) {
    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = "/"
    homeUrl.search = ""
    return NextResponse.redirect(homeUrl)
  }

  // Loja em manutenção — recusa qualquer criação de pedido novo (fechado por
  // padrão: mesmo se o pathname mudar de forma inesperada, o método não-GET
  // sozinho já não seria suficiente pra passar). Navegação/admin/cadastro
  // seguem liberados; /loja mostra "em breve" sozinha (ver app/loja/**).
  // Anônimo (sem cookie de sessão) é recusado aqui mesmo, sem consultar o
  // banco — só quando existe sessão a checagem espera o perfil ser resolvido
  // abaixo, para que um WEB MASTER logado possa passar direto.
  if (storeMaintenanceMode && !hasSupabaseSession(request)) {
    return storeMaintenanceResponse(request, isAffiliatePath)
  }

  // Mercado REMOVIDO do produto (2026-09-12): as rotas `/mercado/**` e
  // `/api/market/**` não existem mais. O redirect fica como rede de segurança
  // para links antigos (posts do fórum, banners, resultados de busca), que de
  // outro modo cairiam num 404 — barato, e some sozinho quando os links morrerem.
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
    captureReferralRef(request, response)
    return response
  }

  // `needProfile` agora é sempre true quando há sessão. Antes era só
  // admin/manutenção, para poupar uma query por pageview de usuário comum —
  // mas o gate de MFA obrigatório do WEB MASTER (lá embaixo) decide por
  // `isWebMaster(profile)`, e com `profile: null` em rota pública ele nunca
  // dispararia: um webmaster sem 2FA navegaria o site inteiro, e a exigência
  // valeria só dentro do /admin. Como só vale para quem TEM cookie de sessão
  // (visitante anônimo já retornou acima), o custo recai sobre usuários
  // logados, não sobre o tráfego indexável — que é o que a otimização
  // original protegia.
  const {
    response,
    user,
    profile,
    aal,
    hasVerifiedMfaFactor,
    needsLgpdConsent,
    isAccountBanned,
    hasStoreAccess,
  } = await updateSession(request, { needProfile: true })

  // ── Ban geral de conta (vale para QUALQUER usuário autenticado) ──
  // Roda antes do 2FA e do LGPD: uma conta banida nunca deve progredir por
  // essas telas, só ser expulsa. `updateSession` já chamou signOut() ao
  // detectar o ban, então o cookie copiado abaixo já sai invalidado.
  if (user && isAccountBanned && !isPublicAuthRoute(pathname)) {
    if (pathname.startsWith("/api")) {
      const apiResponse = NextResponse.json({ error: "account_banned" }, { status: 403 })
      copyCookies(response, apiResponse)
      return apiResponse
    }

    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    loginUrl.search = ""
    loginUrl.searchParams.set("error", "account_banned")

    const redirectResponse = NextResponse.redirect(loginUrl)
    copyCookies(response, redirectResponse)
    return redirectResponse
  }

  // ── Sessão "logado como" (impersonation) — modo SOMENTE LEITURA ──
  // Enquanto o WEB MASTER navega como um usuário comum, os cookies sb-* são do
  // alvo (o proxy nem sabe que é impersonation pela sessão). O sinal é o
  // cookie `imp-origin`, assinado e emitido só pelo endpoint de start.
  //
  // Regras (LGPD Art. 6º, III — minimização; ver lib/server/impersonation.ts):
  //   • Nenhuma escrita: todo método != GET/HEAD sob /api é recusado, exceto
  //     o próprio /api/admin/impersonate/stop (precisa encerrar a sessão).
  //   • O painel /admin fica fora dos limites: durante a sessão o admin só
  //     observa o site público como o usuário. Exceção: /admin/impersonate/*
  //     e a página de usuários (para onde o "Encerrar" leva de volta).
  //   • Expirado (cookie some sozinho no TTL, mas defesa em profundidade):
  //     força o /stop.
  const impOriginCookie = request.cookies.get(IMPERSONATION_ORIGIN_COOKIE)?.value
  if (impOriginCookie) {
    const activeRaw = request.cookies.get(IMPERSONATION_ACTIVE_COOKIE)?.value
    let expiresAt = 0
    try {
      expiresAt = Number(JSON.parse(activeRaw ?? "{}").expiresAt) || 0
    } catch {
      expiresAt = 0
    }
    const expired = expiresAt > 0 && Date.now() > expiresAt
    const isStopRoute = pathname === "/api/admin/impersonate/stop"

    if (expired && !isStopRoute) {
      // Deixa a navegação seguir só para acionar o stop no client; o restante
      // é barrado abaixo até lá.
      const stopUrl = request.nextUrl.clone()
      stopUrl.pathname = "/admin/users"
      stopUrl.search = "?impersonation=expired"
      const redirectResponse = NextResponse.redirect(stopUrl)
      copyCookies(response, redirectResponse)
      return redirectResponse
    }

    if (!isStopRoute) {
      const method = request.method.toUpperCase()
      const isWrite = method !== "GET" && method !== "HEAD" && method !== "OPTIONS"

      // Qualquer escrita, não só sob `/api`: Server Actions são POST na rota
      // da PÁGINA (ex.: `/reset-password`, `/consentimento`), então o filtro
      // antigo por prefixo deixava o admin trocar a senha do usuário alvo
      // durante uma sessão que deveria ser somente leitura.
      if (isWrite) {
        const apiResponse = NextResponse.json(
          { error: "impersonation_read_only", message: "Sessão de acesso é somente leitura." },
          { status: 403 }
        )
        copyCookies(response, apiResponse)
        return apiResponse
      }

      const adminAllowed =
        pathname.startsWith("/admin/impersonate") ||
        pathname === "/admin/users" ||
        pathname.startsWith("/api/admin/impersonate")

      if (isAdminRoute && !adminAllowed) {
        if (pathname.startsWith("/api")) {
          const apiResponse = NextResponse.json({ error: "impersonation_read_only" }, { status: 403 })
          copyCookies(response, apiResponse)
          return apiResponse
        }
        const usersUrl = request.nextUrl.clone()
        usersUrl.pathname = "/admin/users"
        usersUrl.search = ""
        const redirectResponse = NextResponse.redirect(usersUrl)
        copyCookies(response, redirectResponse)
        return redirectResponse
      }
    }
  }

  // Loja em manutenção, mas há sessão: passam o WEB MASTER e quem tem a
  // liberação individual do "pacote Loja" (`user_profiles.store_access`,
  // concedida em /admin/users). Qualquer outro usuário logado (ou perfil
  // ausente) continua recusado.
  //
  // `hasStoreAccess` vem da query de `user_profiles` que o updateSession já
  // faz — a regra equivalente no lado server-only vive em
  // lib/server/auth/store-access.ts; as duas precisam concordar.
  if (storeMaintenanceMode && !isWebMaster(profile) && !hasStoreAccess) {
    const blockedResponse = storeMaintenanceResponse(request, isAffiliatePath)
    copyCookies(response, blockedResponse)
    return blockedResponse
  }
  // Cobre também o caminho autenticado (visitante com sessão clicando num
  // link de afiliado) — o cookie é copiado adiante em todo `redirectResponse`
  // via `copyCookies`, então gravar aqui é suficiente para os dois casos.
  captureAffiliateRef(request, response)
  captureReferralRef(request, response)

  // ── Aplicação do 2FA (vale para QUALQUER usuário autenticado) ──
  // Sessão em aal1 com fator verificado pendente: a sessão existe mas ainda
  // não vale como autenticada para fins de acesso. Bloqueia tudo até o
  // step-up, exceto a própria página de verificação e as rotas de auth.
  //
  // `/reset-password` nunca aceita o atalho de dispositivo confiável: a
  // sessão ali é de recovery (recém-criada pelo link de e-mail), e o GoTrue
  // recusa `updateUser({ password })` com 401 insufficient_aal mesmo com o
  // cookie de dispositivo confiável — só um step-up TOTP real eleva a aal2.
  // Cobre também `/2fa?next=/reset-password`: sem checar o `next` aqui, o
  // bloco abaixo (linha ~321) via o dispositivo como confiável e mandava de
  // volta para `/reset-password` antes de pedir o código, que por sua vez
  // mandava de volta para `/2fa` — loop infinito (ERR_TOO_MANY_REDIRECTS).
  const targetsResetPassword =
    pathname === "/reset-password" ||
    (pathname === TWO_FACTOR_PATH && sanitizeNextPath(request.nextUrl.searchParams.get("next")) === "/reset-password")
  const trustedDevice =
    user && isMfaStepUpRequired(aal) && !targetsResetPassword
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

  // ── MFA OBRIGATÓRIO PARA WEB MASTER ──
  // O bloco de 2FA acima só age quando a conta JÁ tem um fator verificado
  // (`isMfaStepUpRequired` exige `next === "aal2"`). Quem nunca cadastrou
  // TOTP tem `next === "aal1"` e passa direto — inclusive um WEB MASTER, que
  // é a conta que pode trocar senha de terceiros, rebaixar admins e mexer em
  // dinheiro. Este gate fecha isso: para o cargo mais alto, ter 2FA deixa de
  // ser opcional.
  //
  // O corte é `isWebMaster`, o mesmo de `canChangePasswords` e do gate de
  // manutenção — não uma permissão da matriz. Cargos abaixo seguem com o 2FA
  // opcional, de propósito: o objetivo é proteger a conta que concentra o
  // poder, sem transformar o onboarding de moderador/suporte num obstáculo.
  //
  // Só bloqueia a NAVEGAÇÃO, não o login: a pessoa entra normalmente e é
  // levada para `/conta#seguranca` até ativar. Sem isso a regra seria
  // irreversível pela interface — um webmaster sem TOTP ficaria trancado
  // fora da própria tela de cadastrar TOTP.
  if (
    user &&
    isWebMaster(profile) &&
    !hasVerifiedMfaFactor &&
    !isMfaSetupAllowedPath(pathname, request.method) &&
    !isServerActionRequest(request)
  ) {
    if (pathname.startsWith("/api")) {
      const apiResponse = NextResponse.json(
        {
          error: "mfa_enrollment_required",
          message: "Contas WEB MASTER precisam ativar a verificação em duas etapas.",
        },
        { status: 403 }
      )
      copyCookies(response, apiResponse)
      return apiResponse
    }

    const setupUrl = request.nextUrl.clone()
    setupUrl.pathname = MFA_SETUP_PATH
    setupUrl.search = ""
    setupUrl.hash = MFA_SETUP_HASH

    const redirectResponse = NextResponse.redirect(setupUrl)
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

  // ── Manutenção geral — SÓ WEB MASTER atravessa ──
  // Antes a condição era `!profile`: qualquer linha em `admin_profiles` passava,
  // ou seja editor/vendedor/moderador/suporte navegavam o site inteiro durante
  // a janela. Manutenção é troca de token e migração — estado em que o site
  // pode responder qualquer coisa —, então o corte é o cargo mais alto, o mesmo
  // usado por `canChangePasswords`. Impersonation não é brecha aqui: os cookies
  // da sessão são do usuário-alvo, então `profile` é null e cai neste bloqueio.
  if (maintenanceMode && !isWebMaster(profile)) {
    // `/maintenance` é o destino desta própria regra: precisa renderizar, ou o
    // redirect abaixo a mandaria para o login e o usuário nunca veria o aviso.
    // `/admin/login` continua aberto para o WEB MASTER conseguir entrar — sem
    // ele a manutenção se tornaria irreversível pela interface.
    if (
      isLoginRoute ||
      isPublicAuthRoute(pathname) ||
      pathname === MAINTENANCE_STATUS_PATH ||
      isMachineToMachinePath(pathname)
    ) {
      return response
    }

    if (pathname.startsWith("/api")) {
      const apiResponse = NextResponse.json({ error: "Site em manutenção." }, { status: 503 })
      applyMaintenanceHeaders(apiResponse)
      copyCookies(response, apiResponse)
      return apiResponse
    }

    // REWRITE, não redirect. A URL original é preservada e responde 503 nela
    // mesma — o Google precisa ver o 503 em `/forum`, `/blog`, etc., que são
    // as URLs que ele tem indexadas. Um redirect (307) para `/maintenance`
    // diria outra coisa: que aquele conteúdo se mudou. Pior, o crawler
    // seguiria o redirect e encontraria um 200 na ponta — lendo a tela de
    // manutenção como o conteúdo definitivo daquela URL e derrubando a
    // posição. Com rewrite + 503 + Retry-After, a leitura é "volte depois",
    // que é justamente o tratamento documentado do Google para janelas de
    // indisponibilidade, e o ranking é preservado.
    //
    // `/maintenance` também cai aqui (não está mais na allow-list acima):
    // servida diretamente ela respondia 200, o mesmo problema. A exceção
    // some porque o rewrite já a renderiza para qualquer rota.
    const maintenanceUrl = request.nextUrl.clone()
    maintenanceUrl.pathname = MAINTENANCE_PATH
    maintenanceUrl.search = ""

    const maintenanceResponse = NextResponse.rewrite(maintenanceUrl, { status: 503 })
    applyMaintenanceHeaders(maintenanceResponse)
    copyCookies(response, maintenanceResponse)
    return maintenanceResponse
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