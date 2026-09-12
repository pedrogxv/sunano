"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Crown,
  Handshake,
  KeyRound,
  Link2,
  Shield,
  SlidersHorizontal,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuthUser } from "@/components/providers/auth-context"
import { useAccountOverview, type AccountOverview } from "@/lib/hooks/use-account-overview"
import { cn } from "@/lib/utils"

import { LinkedAccountsTab } from "./LinkedAccountsTab"
import { PreferencesTab } from "./PreferencesTab"
import { PrivacidadeTab } from "./PrivacidadeTab"
import { SecurityTab } from "./SecurityTab"
import { SubscriptionTab } from "./SubscriptionTab"

interface AccountSectionProps {
  email: string | null
  lgpdConsentAt: string | null
  lgpdConsentVersion: string | null
}

type SectionId = "seguranca" | "conexoes" | "assinatura" | "preferencias" | "privacidade" | "afiliados"

/**
 * Selo de estado no rosto do card. `tone` é o que dá leitura periférica: o
 * usuário varre o grid e vê onde falta atenção sem ler uma palavra.
 */
type StatusTone = "good" | "warn" | "neutral" | "muted"

type SectionStatus = { label: string; tone: StatusTone } | null

type SectionDef = {
  id: SectionId
  label: string
  Icon: typeof KeyRound
  /** Frase do card fechado — o que a pessoa resolve aqui. */
  tagline: string
  /** Cabeçalho da seção aberta. Mais específico que a tagline. */
  description: string
  /** Estado atual desta área, quando conhecido. */
  status: (ctx: StatusContext) => SectionStatus
}

type StatusContext = {
  overview: AccountOverview
  vipState: string
  vipExpiresAt: string | null
  consentAt: string | null
}

const SECTIONS_ORDER: SectionId[] = [
  "seguranca",
  "conexoes",
  "assinatura",
  "preferencias",
  "privacidade",
  "afiliados",
]

function formatShortDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

const SECTION_DEFS: Record<SectionId, SectionDef> = {
  seguranca: {
    id: "seguranca",
    label: "Segurança",
    Icon: KeyRound,
    tagline: "Senha e verificação em duas etapas.",
    description: "Troque a senha e configure o 2FA por aplicativo autenticador.",
    status: ({ overview }) => {
      if (overview.twoFactorEnabled === null) return null
      return overview.twoFactorEnabled
        ? { label: "2FA ativo", tone: "good" }
        : { label: "2FA desativado", tone: "warn" }
    },
  },
  conexoes: {
    id: "conexoes",
    label: "Conexões",
    Icon: Link2,
    tagline: "Logins sociais vinculados à sua conta.",
    description: "Vincule Google e Discord para entrar com um clique.",
    status: ({ overview }) => {
      if (overview.linkedProviders === null) return null
      const { linkedProviders: n, totalProviders: total } = overview
      if (n === 0) return { label: "Nenhuma conectada", tone: "muted" }
      return {
        label: `${n} de ${total} conectada${n > 1 ? "s" : ""}`,
        tone: n === total ? "good" : "neutral",
      }
    },
  },
  assinatura: {
    id: "assinatura",
    label: "Assinatura",
    Icon: Crown,
    tagline: "Seu plano VIP, cobrança e renovação.",
    description: "Estado da cobrança, renovação e cancelamento do seu plano VIP.",
    // Lê o estado JÁ RESOLVIDO do contexto de auth (lib/vip-status.ts) — o selo
    // não pode inventar a sua própria leitura dos campos crus, foi exatamente
    // assim que sidebar e dropdown passaram a discordar entre si.
    status: ({ vipState, vipExpiresAt }) => {
      const until = formatShortDate(vipExpiresAt)
      switch (vipState) {
        case "active":
          return { label: until ? `VIP até ${until}` : "VIP ativo", tone: "good" }
        case "granted":
          return { label: "VIP concedido", tone: "good" }
        case "pending":
          return { label: "Pagamento pendente", tone: "warn" }
        case "past_due":
          return { label: "Cobrança atrasada", tone: "warn" }
        case "reactivatable":
          return { label: until ? `Cancelado · vale até ${until}` : "Cancelado", tone: "warn" }
        case "lapsed":
          return { label: "Assinatura encerrada", tone: "muted" }
        default:
          return { label: "Sem assinatura", tone: "muted" }
      }
    },
  },
  preferencias: {
    id: "preferencias",
    label: "Preferências",
    Icon: SlidersHorizontal,
    tagline: "Idioma e sessões nos seus dispositivos.",
    description: "Idioma da interface e encerramento das sessões ativas.",
    status: () => null,
  },
  privacidade: {
    id: "privacidade",
    label: "Privacidade e dados",
    Icon: Shield,
    tagline: "Consentimento, exportação e exclusão (LGPD).",
    description: "Consentimento, exportação dos seus dados e exclusão da conta (LGPD).",
    status: ({ consentAt }) =>
      consentAt
        ? { label: "Consentimento registrado", tone: "good" }
        : { label: "Consentimento não registrado", tone: "muted" },
  },
  afiliados: {
    id: "afiliados",
    label: "Afiliados",
    Icon: Handshake,
    tagline: "Indique a loja e receba comissão.",
    description: "Indique a loja e receba comissão sobre as vendas confirmadas.",
    status: () => ({ label: "Painel externo", tone: "neutral" }),
  },
}

const TONE_CLASSES: Record<StatusTone, string> = {
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  neutral: "border-border bg-muted/40 text-muted-foreground",
  muted: "border-border/60 bg-muted/20 text-muted-foreground/80",
}

function isSectionId(value: string): value is SectionId {
  return value in SECTION_DEFS
}

/**
 * Hub da conta: um grid de cards, um por área, cada um mostrando o estado
 * real daquela área no próprio rosto. Clicar abre a seção NO LUGAR do grid —
 * o card escolhido vira o cabeçalho da área aberta, com um "Voltar" acima.
 *
 * POR QUE NÃO O SCROLL DE ÂNCORAS DE ANTES
 * ----------------------------------------
 * A tela empilhava as cinco áreas inteiras, uma embaixo da outra, com botões
 * no topo que só rolavam até elas. Quem entrava para trocar a senha descia
 * por assinatura, idioma e LGPD no caminho, e não havia como saber se o 2FA
 * estava ligado sem chegar até lá e ler. O hub troca "tudo aberto, role até
 * achar" por "escolha uma, veja só ela" — e o selo de status responde a
 * pergunta mais comum (como está isso?) antes de qualquer clique.
 *
 * DEEP LINK É REQUISITO, NÃO ENFEITE
 * ----------------------------------
 * `/conta#assinatura` é para onde o `POST /api/vip/subscribe` manda em caso de
 * erro, para onde o `SubscriptionTab` faz `router.replace` ao voltar do
 * checkout, e o destino de `VipUpsellModal`/`VipMonthCard`. `#conexoes` é o
 * retorno do OAuth ao vincular uma conta social, e `/privacidade` linka
 * `#privacidade` duas vezes. Todos precisam cair na seção ABERTA, então o
 * hash manda no estado — e mudar de seção escreve o hash de volta, para que
 * o botão "voltar" do navegador ande pelas seções e o link seja copiável.
 */
export function AccountSection({ email, lgpdConsentAt, lgpdConsentVersion }: AccountSectionProps) {
  const { user: authUser } = useAuthUser()
  const overview = useAccountOverview()

  // Afiliados acompanha a manutenção da Loja (ver lib/server/auth/affiliate-access.ts).
  // O WEB MASTER continua vendo a seção, igual ao que faz na Loja.
  // Resolvido no servidor (ver /api/auth/me): manutenção desligada, WEB MASTER,
  // ou liberação individual do "pacote Loja". Ler a env aqui não funcionaria —
  // no browser a variante sem NEXT_PUBLIC_ não existe.
  const showAffiliates = authUser?.canUseStore ?? false

  const sections = useMemo(
    () =>
      SECTIONS_ORDER.filter((id) => id !== "afiliados" || showAffiliates).map(
        (id) => SECTION_DEFS[id]
      ),
    [showAffiliates]
  )

  const statusContext: StatusContext = {
    overview,
    vipState: authUser?.vip?.state ?? "none",
    vipExpiresAt: authUser?.vipExpiresAt ?? null,
    consentAt: lgpdConsentAt,
  }

  const [openId, setOpenId] = useState<SectionId | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  /** Só rola ao abrir por clique; chegar por deep link não deve dar um salto. */
  const shouldScrollRef = useRef(false)

  // O hash é a fonte da verdade de qual seção está aberta: vale para a carga
  // inicial (deep link) e para a navegação no histórico, que não dispara
  // re-render por conta própria.
  //
  // Os DOIS eventos são necessários. `open`/`close` usam `pushState`, e
  // `pushState` NÃO dispara `hashchange` — voltar do `#seguranca` para o hub
  // emite apenas `popstate`. Ouvir só `hashchange` deixava a seção aberta
  // contradizendo uma URL já sem hash, com o botão "voltar" sem efeito
  // visível. `hashchange` continua valendo para quem edita o hash na barra de
  // endereço ou chega por um link de âncora.
  useEffect(() => {
    function syncFromHash() {
      const raw = window.location.hash.replace(/^#/, "")
      // Hash ausente, desconhecido ou de seção escondida (Afiliados em
      // manutenção) cai no hub, em vez de manter aberto o que estava antes.
      const valid = isSectionId(raw) && (raw !== "afiliados" || showAffiliates)
      setOpenId(valid ? raw : null)
    }
    syncFromHash()
    window.addEventListener("hashchange", syncFromHash)
    window.addEventListener("popstate", syncFromHash)
    return () => {
      window.removeEventListener("hashchange", syncFromHash)
      window.removeEventListener("popstate", syncFromHash)
    }
  }, [showAffiliates])

  const open = useCallback((id: SectionId) => {
    shouldScrollRef.current = true
    setOpenId(id)
    // `pushState` em vez de mexer em `location.hash`: escreve o histórico sem
    // o salto de âncora do navegador (a rolagem é nossa, logo abaixo) e sem
    // disparar o `hashchange` que acabaria re-aplicando o mesmo estado.
    window.history.pushState(null, "", `#${id}`)
  }, [])

  const close = useCallback(() => {
    setOpenId(null)
    // Preserva a query — só o hash sai. `pathname` puro descartaria parâmetros
    // que outra parte da tela ainda esteja lendo (`?vip=`, `?link_error=`).
    window.history.pushState(null, "", `${window.location.pathname}${window.location.search}`)
  }, [])

  // Ao abrir por clique, alinha o topo do painel — a seção aberta pode ser bem
  // mais alta que o grid, e sem isso a pessoa cairia no meio do conteúdo.
  useEffect(() => {
    if (!openId || !shouldScrollRef.current) return
    shouldScrollRef.current = false
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [openId])

  const openSection = openId ? SECTION_DEFS[openId] : null

  if (openSection) {
    const { Icon, label, description } = openSection
    return (
      <div ref={panelRef} className="scroll-mt-20 space-y-5">
        <button
          type="button"
          onClick={close}
          className="group inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
          Todas as configurações
        </button>

        <div className="flex items-start gap-3 border-b border-border/60 pb-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-primary">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <h2 className="text-lg font-bold tracking-tight text-foreground">{label}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <SectionBody
          id={openSection.id}
          email={email}
          lgpdConsentAt={lgpdConsentAt}
          lgpdConsentVersion={lgpdConsentVersion}
          onStateChange={overview.refresh}
        />
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {sections.map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          status={section.status(statusContext)}
          onOpen={() => open(section.id)}
        />
      ))}
    </div>
  )
}

function SectionCard({
  section,
  status,
  onOpen,
}: {
  section: SectionDef
  status: SectionStatus
  onOpen: () => void
}) {
  const { Icon, label, tagline } = section
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col items-start rounded-xl border border-border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-muted/30 hover:shadow-lg hover:shadow-black/10"
    >
      <div className="mb-3 flex w-full items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-primary transition-colors group-hover:border-primary/40">
          <Icon className="size-[18px]" />
        </span>
        <ArrowRight className="mt-2 size-4 shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>

      <h2 className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
        {label}
      </h2>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{tagline}</p>

      {status && (
        <span
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            TONE_CLASSES[status.tone]
          )}
        >
          <span className="size-1.5 shrink-0 rounded-full bg-current" />
          {status.label}
        </span>
      )}
    </button>
  )
}

function SectionBody({
  id,
  email,
  lgpdConsentAt,
  lgpdConsentVersion,
  onStateChange,
}: {
  id: SectionId
  email: string | null
  lgpdConsentAt: string | null
  lgpdConsentVersion: string | null
  onStateChange: () => void
}) {
  switch (id) {
    case "seguranca":
      return <SecurityTab email={email} onFactorsChange={onStateChange} />
    case "conexoes":
      return <LinkedAccountsTab onIdentitiesChange={onStateChange} />
    case "assinatura":
      return <SubscriptionTab />
    case "preferencias":
      return <PreferencesTab />
    case "privacidade":
      return (
        <PrivacidadeTab
          email={email}
          lgpdConsentAt={lgpdConsentAt}
          lgpdConsentVersion={lgpdConsentVersion}
        />
      )
    case "afiliados":
      return (
        <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-border/60 bg-secondary/30 px-5 py-4 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">
            Acompanhe seu saldo, extrato e link de indicação no painel do afiliado.
          </p>
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/afiliados">
              Acessar painel
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      )
  }
}
