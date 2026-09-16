"use client"

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"

import { supabaseAuth } from "@/lib/client/supabase-auth"
import { readAuthSnapshot, writeAuthSnapshot } from "@/lib/client/auth-snapshot"
import { isVipActive } from "@/lib/account-tier"
import { resolveVipStatus, type VipStatus } from "@/lib/vip-status"

export type AuthContextUser = {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  isAdmin: boolean
  /** WEB MASTER — ignora o modo de manutenção da Loja e do Programa de Afiliados. */
  isWebMaster: boolean
  /**
   * A Loja e o Programa de Afiliados estão abertos PARA ESTE usuário agora.
   *
   * Já vem RESOLVIDO pelo servidor (`/api/auth/me`), que combina os três
   * fatores: manutenção desligada, ser WEB MASTER, ou ter a liberação
   * individual do "pacote Loja" (`user_profiles.store_access`, concedida em
   * /admin/users). O client não recalcula nada — a env de manutenção nem
   * existe no browser sem a variante NEXT_PUBLIC_, que foi justamente a
   * origem do vazamento de UI descrito em lib/store-maintenance.ts.
   */
  canUseStore: boolean
  /** Se já abriu algum chamado de suporte — controla o item "Meus Tickets" do dropdown/nav (só aparece com histórico). */
  hasSupportTicket: boolean
  /** Quantos tickets abertos estão aguardando resposta do usuário — alimenta o ponto amber no sino e em "Meus Tickets". */
  supportTicketsAwaitingMe: number
  /**
   * VIP ativo agora (já considera expiração) — alimenta a tag roxa no
   * dropdown da topbar e o "Seja VIP" da sidebar.
   *
   * Derivado de `accountTier`/`vipExpiresAt` NO MOMENTO DA LEITURA, não
   * congelado no fetch: uma aba aberta atravessando a data de expiração
   * mostrava "VIP" para sempre, porque nada reconsulta `/api/auth/me` sem
   * troca de cookie de sessão. Ver `buildUser`.
   */
  isVip: boolean
  /** Tier cru, como veio do servidor — base de `isVip`. */
  accountTier: string | null
  /** Expiração crua do VIP (null = sem expiração: cargo/manual). */
  vipExpiresAt: string | null
  /** Status cru da assinatura recorrente (null = nunca assinou). Base de `vip`. */
  subscriptionStatus: string | null
  /**
   * Moldura de avatar equipada. A topbar a desenha pelo mesmo
   * `ProfileAvatar` do resto do site — sem isso o próprio usuário era o único
   * que não via a moldura que comprou.
   */
  equippedFrameUrl: string | null
  equippedFrameSlug: string | null
  /**
   * Se possui a Moldura de Fundador (assinou o VIP na janela de lançamento).
   * Permanente: continua `true` depois de a assinatura acabar, então NÃO se
   * deriva de `isVip`.
   */
  isFounder: boolean
  /**
   * RECORDE de ofensiva — decide a moldura de marco do próprio avatar.
   * Permanente, como o Fundador: não é a ofensiva viva.
   */
  longestStreak: number
  /** O dono escolheu não exibir moldura nenhuma. */
  frameOptOut: boolean
  /**
   * ESTADO RESOLVIDO do VIP e da assinatura — o que toda UI deve consumir.
   *
   * Substitui o antigo booleano `subscriptionCanceled`, que não distinguia
   * "cancelou com período pago correndo" (reativar, sem cobrança) de
   * "cancelou e já venceu" (assinar de novo, com cobrança). Cada tela
   * aplicava a sua própria leitura desse booleano e elas divergiam: a
   * sidebar chegou a esconder o Changelog e oferecer "Renovar VIP" a um VIP
   * ativo. Ver lib/vip-status.ts.
   */
  vip: VipStatus
  /** Se já criou algum post no fórum — controla a aba "Meus Posts" da listagem (só aparece com histórico). */
  hasForumPost: boolean
}

type AuthContextValue = {
  user: AuthContextUser | null
  /**
   * Ainda não há resposta AUTORITATIVA do servidor nesta sessão de página.
   *
   * Continua sendo o sinal correto para decisões que não podem errar. Para
   * decidir entre mostrar ESQUELETO ou mostrar a interface, porém, use
   * `pending`: com o snapshot semeado já existe o que desenhar, e insistir no
   * esqueleto enquanto `loading` é `true` recriaria o salto que o snapshot
   * remove.
   */
  loading: boolean
  /**
   * Não há NADA para desenhar ainda — nem confirmado pelo servidor, nem
   * palpitado pelo snapshot. É este o sinal que a UI deve usar para escolher o
   * esqueleto.
   */
  pending: boolean
  /**
   * Reconsulta `/api/auth/me` imediatamente. Necessário para o login pelo
   * modal (ver AuthModal): sem `redirect()` do servidor, nem o pathname muda
   * nem o `onAuthStateChange` do navegador dispara (a sessão nasceu de uma
   * server action, não de uma chamada do `supabaseAuth` no client) — sem este
   * método a topbar continuaria mostrando "Login" até a próxima navegação.
   */
  refresh: () => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  pending: true,
  refresh: () => {},
})

/** Teto para `/api/auth/me`. Um fetch pendurado sem limite deixaria o avatar da
 *  topbar em skeleton e o sino invisível para sempre. */
const ME_TIMEOUT_MS = 8000


/** Espera antes da única retentativa. Cobre a queda momentânea de rede que,
 *  sem ela, mostraria "Login" a quem está logado até a próxima navegação. */
const RETRY_DELAY_MS = 1200

/**
 * Assinatura dos cookies de sessão do Supabase, para detectar que a sessão
 * MUDOU sem perguntar nada ao servidor.
 *
 * Compara o valor, e não a mera presença: concluir o 2FA troca uma sessão aal1
 * por uma aal2 mantendo o cookie existindo o tempo todo — um booleano de
 * "existe/não existe" não veria diferença nenhuma e deixaria a topbar
 * desatualizada justamente para quem usa segundo fator.
 *
 * É um sinal BARATO e síncrono para decidir se vale reperguntar ao servidor —
 * nunca a fonte de verdade sobre quem está logado. Hoje esses cookies não são
 * `httpOnly` (o client do navegador precisa lê-los); se um dia forem, esta
 * função passa a devolver "" sempre e o efeito que a consome simplesmente para
 * de disparar reconsultas extras — nunca produz estado errado.
 */
function sessionCookieSignature(): string {
  if (typeof document === "undefined") return ""
  return document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => {
      const name = entry.split("=")[0] ?? ""
      // O `-code-verifier` existe DURANTE o fluxo OAuth, quando ainda não há
      // sessão: incluí-lo provocaria uma consulta inútil.
      return name.startsWith("sb-") && name.includes("-auth-token") && !name.includes("code-verifier")
    })
    // O cookie é fatiado em `.0`, `.1`… quando o JWT é grande; a ordem em
    // `document.cookie` não é garantida, então ordena antes de comparar.
    .sort()
    .join("|")
}

type MeResponse = {
  user?: { id: string; email: string | null } | null
  userProfile?: { display_name?: string | null; avatar_url?: string | null } | null
  adminProfile?: {
    email?: string | null
    display_name?: string | null
    avatar_url?: string | null
    role?: string | null
  } | null
  hasSupportTicket?: boolean
  supportTicketsAwaitingMe?: number
  hasForumPost?: boolean
  accountTier?: string | null
  vipExpiresAt?: string | null
  subscriptionStatus?: string | null
  canUseStore?: boolean
  equippedFrameUrl?: string | null
  equippedFrameSlug?: string | null
  isFounder?: boolean
  longestStreak?: number | null
  frameOptOut?: boolean | null
}

/**
 * Monta o usuário do contexto a partir do payload cru da sessão.
 *
 * Existe separado de `fetchMe` para ser reutilizável por qualquer origem do
 * mesmo payload — hoje o fetch do client, e amanhã um render de servidor, caso
 * o app venha a adotar Cache Components (ver o comentário de
 * lib/client/auth-snapshot.ts sobre por que isso ainda não é possível).
 */
export function buildAuthUser(data: MeResponse): AuthContextUser | null {
  const { user, userProfile, adminProfile, hasSupportTicket, supportTicketsAwaitingMe, hasForumPost, accountTier, vipExpiresAt, subscriptionStatus, canUseStore, equippedFrameUrl, equippedFrameSlug, isFounder, longestStreak, frameOptOut } = data
  if (!user) return null

  return {
    id: user.id,
    email: adminProfile?.email || user.email || "",
    displayName:
      adminProfile?.display_name ||
      userProfile?.display_name ||
      user.email?.split("@")[0] ||
      "Usuário",
    avatarUrl: adminProfile?.avatar_url || userProfile?.avatar_url || null,
    isAdmin: Boolean(adminProfile),
    isWebMaster: adminProfile?.role === "webmaster",
    canUseStore: Boolean(canUseStore),
    hasSupportTicket: Boolean(hasSupportTicket),
    supportTicketsAwaitingMe: supportTicketsAwaitingMe ?? 0,
    isVip: isVipActive(accountTier, vipExpiresAt),
    accountTier: accountTier ?? null,
    vipExpiresAt: vipExpiresAt ?? null,
    subscriptionStatus: subscriptionStatus ?? null,
    vip: resolveVipStatus({ accountTier, vipExpiresAt, subscriptionStatus }),
    equippedFrameUrl: equippedFrameUrl ?? null,
    equippedFrameSlug: equippedFrameSlug ?? null,
    isFounder: Boolean(isFounder),
    longestStreak: longestStreak ?? 0,
    frameOptOut: Boolean(frameOptOut),
    hasForumPost: Boolean(hasForumPost),
  }
}

/**
 * Quem está logado, segundo o SERVIDOR — que lê o cookie de sessão e já aplica
 * a regra de 2FA (devolve `user: null` enquanto a sessão está em aal1 com fator
 * pendente, ver lib/server/auth/resolve-auth-user.ts). Por isso o cliente não
 * precisa — e não deve — repetir a checagem de MFA por conta própria.
 */
async function fetchMe(signal: AbortSignal): Promise<AuthContextUser | null> {
  const res = await fetch("/api/auth/me", { signal, cache: "no-store" })
  if (!res.ok) throw new Error(`auth/me respondeu ${res.status}`)

  return buildAuthUser((await res.json()) as MeResponse)
}

/**
 * Única fonte de verdade sobre a sessão no cliente, montada uma vez na raiz
 * (app/layout.tsx).
 *
 * São três gatilhos, e nenhum depende dos outros:
 *
 *  1. MOUNT — `/api/auth/me`, uma chamada HTTP comum que só depende do cookie e
 *     não encosta no lock de auth do gotrue-js. Quando o `onAuthStateChange`
 *     era a única fonte, qualquer falha em entregar o evento inicial (webview,
 *     aba restaurada, lock órfão) travava a topbar no esqueleto para sempre.
 *     É sempre esta que produz a primeira resposta AUTORITATIVA.
 *  2. NAVEGAÇÃO — cobre login/2FA/logout, que são server actions: o cookie
 *     muda no servidor sem que o client do navegador fique sabendo.
 *  3. `onAuthStateChange` — cobre o que acontece pelo próprio navegador
 *     (`signOut()` client-side, OAuth, refresh de token).
 *
 * Antes dos três, e apenas como PALPITE, entra o snapshot da última sessão
 * conhecida (lib/client/auth-snapshot.ts): ele pinta a interface certa antes
 * da primeira renderização e é confirmado — ou corrigido — pelo gatilho 1 logo
 * em seguida. É o que remove o salto de 1–2s no selo VIP sem tornar as páginas
 * dinâmicas, já que o HTML servido pelo cache ISR precisa continuar igual para
 * todos os visitantes.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Começa SEMPRE vazio, igual ao que o servidor renderiza. Ler o snapshot
  // aqui produziria HTML do servidor (sem storage) diferente do primeiro
  // render do cliente (com storage) — erro de hidratação. O snapshot é
  // aplicado no efeito abaixo, que roda antes da pintura.
  const [user, setUser] = useState<AuthContextUser | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  // Descarta respostas fora de ordem — sem isso um `me` lento disparado antes
  // de um logout poderia ressuscitar o usuário depois de ele sair.
  const requestId = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Assinatura do cookie na última vez que consultamos o servidor. Guardar
  // isso é o que impede o efeito de navegação de virar um laço infinito quando
  // o cookie existe mas `/api/auth/me` responde `null` — o caso real de uma
  // sessão aal1 com 2FA pendente.
  const cookieAtLastCheck = useRef<string | null>(null)

  const resolve = useCallback(() => {
    const run = (attempt: number) => {
      const id = ++requestId.current
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), ME_TIMEOUT_MS)
      cookieAtLastCheck.current = sessionCookieSignature()

      fetchMe(controller.signal)
        .then((next) => {
          if (id !== requestId.current) return
          setUser(next)
          // Guarda o estado CONFIRMADO pelo servidor para a próxima visita
          // partir dele em vez de partir do zero. É isto que remove o salto
          // visual de quem já navegou logado.
          writeAuthSnapshot(next)
        })
        .catch(() => {
          // Rede fora ou estouro do teto: não dá para afirmar nada sobre a
          // sessão, então preserva o que já havia e tenta de novo UMA vez, em
          // segundo plano. A UI é destravada no `finally` de qualquer jeito:
          // ficar em `loading` é o pior dos mundos, porque esconde o sino e o
          // menu da conta sem nem oferecer o botão de login.
          if (attempt === 0 && id === requestId.current) {
            retryTimer.current = setTimeout(() => run(attempt + 1), RETRY_DELAY_MS)
          }
        })
        .finally(() => {
          clearTimeout(timeout)
          if (id === requestId.current) setLoading(false)
        })
    }

    run(0)
  }, [])

  // Semeia a interface com o último estado conhecido ANTES da primeira pintura.
  // `useLayoutEffect` (e não `useEffect`) é o que garante isso: com `useEffect`
  // o navegador chegaria a desenhar um quadro do estado vazio — "Seja VIP" para
  // um VIP ativo, avatar em esqueleto — e só então corrigiria. Esse quadro é
  // exatamente o salto que se quer eliminar.
  //
  // O React não executa layout effects no servidor, então o HTML servido pelo
  // cache ISR continua idêntico para todo visitante e a hidratação casa: o
  // primeiro render do cliente também parte de `null`, e a semeadura só
  // acontece depois dele.
  useLayoutEffect(() => {
    // Só semeia se AINDA existe cookie de sessão. Sem esta guarda, quem saiu em
    // outra aba — ou teve a sessão expirada — voltaria vendo o próprio avatar e
    // o selo VIP até o `/api/auth/me` responder que não há mais ninguém.
    if (!sessionCookieSignature()) {
      writeAuthSnapshot(null)
      return
    }

    const snapshot = readAuthSnapshot()
    if (!snapshot) return

    // Continua sendo só um palpite: `loading` permanece `true` e o `resolve()`
    // do efeito seguinte confirma ou corrige. Como o valor confirmado quase
    // sempre é idêntico ao exibido, a correção não produz troca visível.
    setUser(snapshot)
  }, [])

  useEffect(() => {
    resolve()

    const {
      data: { subscription },
    } = supabaseAuth.auth.onAuthStateChange((event) => {
      // Este callback roda COM o lock de auth do gotrue-js segurado. Nada de
      // `await` aqui dentro, e muito menos outra chamada de `supabaseAuth.auth`
      // (era `mfa.getAuthenticatorAssuranceLevel()`): ela fica esperando o
      // mesmo lock que este callback segura, o callback nunca termina e o
      // estado nunca sai de `loading`. Todo trabalho assíncrono sai por
      // `setTimeout`, já fora do lock — recomendação da própria Supabase.
      if (event === "SIGNED_OUT") {
        requestId.current++ // invalida qualquer `me` em voo
        if (retryTimer.current) clearTimeout(retryTimer.current)
        cookieAtLastCheck.current = sessionCookieSignature()
        setUser(null)
        // Sem isto a próxima visita partiria do snapshot de quem ACABOU de
        // sair e mostraria o avatar dele por um instante — o mesmo salto de
        // antes, agora com o estado errado.
        writeAuthSnapshot(null)
        setLoading(false)
        return
      }

      // INITIAL_SESSION já está coberto pelo `resolve()` do mount e
      // TOKEN_REFRESHED não muda quem é o usuário — refazer o fetch neles só
      // gera tráfego à toa.
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "MFA_CHALLENGE_VERIFIED") {
        setTimeout(() => resolve(), 0)
      }
    })

    return () => {
      subscription.unsubscribe()
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [resolve])

  useEffect(() => {
    // Login, 2FA e logout são SERVER ACTIONS que terminam em `redirect()`: o
    // cookie muda no servidor e a navegação é client-side, então o layout raiz
    // não remonta (este provider continua com o estado antigo) e o
    // `onAuthStateChange` do navegador não tem como saber de nada — ele só
    // emite eventos de operações feitas pelo próprio client do browser. Sem
    // este efeito, quem acabou de entrar continuaria vendo "Login" e sem sino
    // até apertar F5.
    //
    // Só reconsulta quando o cookie MUDOU desde a última consulta, para não
    // gastar um request a cada navegação de quem está apenas navegando.
    if (cookieAtLastCheck.current === sessionCookieSignature()) return
    resolve()
  }, [pathname, resolve])

  // O VIP expira numa data conhecida, e nenhum dos três gatilhos do provider
  // observa a passagem do tempo — uma aba deixada aberta cruzaria a expiração
  // ainda exibindo o selo VIP. Agenda uma reavaliação para o instante exato
  // do vencimento (e só então), em vez de ficar consultando de tempos em
  // tempos. Sem expiração (`null` = cargo/manual) não há o que agendar.
  const [vipRecheck, forceVipRecheck] = useState(0)
  useEffect(() => {
    const expiresAt = user?.vipExpiresAt
    if (!expiresAt) return
    const msUntilExpiry = new Date(expiresAt).getTime() - Date.now()
    if (msUntilExpiry <= 0) return
    // `setTimeout` satura acima de ~24,8 dias (int32) e dispararia na hora.
    // Nesse caso não agenda: quem deixa a aba aberta tanto tempo já passou
    // por navegações/refetches muito antes.
    if (msUntilExpiry > 2 ** 31 - 1) return
    const timer = setTimeout(() => forceVipRecheck((n) => n + 1), msUntilExpiry + 1000)
    return () => clearTimeout(timer)
  }, [user?.vipExpiresAt])

  // Reavalia `isVip` na leitura em vez de servir o booleano congelado no
  // fetch. `account_tier`/`vip_expires_at` mudam sem que o cookie de sessão
  // mude (cancelamento, expiração do período pago, compra com Aura), e
  // nenhum gatilho do provider observa isso sozinho. `vipRecheck` entra nas
  // dependências de propósito: é ele que reexecuta este cálculo quando o
  // timer acima dispara na virada da expiração.
  const value = useMemo(() => {
    void vipRecheck
    // Reresolve o ESTADO INTEIRO, não só `isVip`: a virada da expiração leva
    // `reactivatable` para `lapsed`, o que troca o CTA de "Reativar
    // assinatura" (sem cobrança) para "Assinar de novo" (com cobrança).
    // Recalcular só o booleano deixaria a sidebar oferecendo reativação
    // gratuita de um período que acabou de vencer.
    const resolved = user
      ? {
          ...user,
          isVip: isVipActive(user.accountTier, user.vipExpiresAt),
          vip: resolveVipStatus({
            accountTier: user.accountTier,
            vipExpiresAt: user.vipExpiresAt,
            subscriptionStatus: user.subscriptionStatus,
          }),
        }
      : null
    // `pending` só enquanto não há resposta do servidor E também não há
    // snapshot semeado: com um palpite na tela, o esqueleto já não é o estado
    // certo a exibir.
    return { user: resolved, loading, pending: loading && resolved === null, refresh: resolve }
  }, [user, loading, resolve, vipRecheck])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Estado de autenticação resolvido uma única vez na raiz do app. */
export function useAuthUser() {
  return useContext(AuthContext)
}
