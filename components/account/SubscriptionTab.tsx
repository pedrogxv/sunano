"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { Crown, Loader2, ShieldX } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuthUser } from "@/components/providers/auth-context"
import { VipUpsellModal } from "@/components/aura/VipUpsellModal"
import { VipPixCharge, type VipPixPayment } from "@/components/account/VipPixCharge"
import { CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import { cn } from "@/lib/utils"
import { vipSubscriptionBenefits, type VipBillingPeriod } from "@/lib/vip-plan"
import { resolveVipStatus } from "@/lib/vip-status"

type SubscriptionStatus = "pending" | "active" | "past_due" | "canceled" | "expired"

interface SubscriptionState {
  subscriptionEnabled: boolean
  vipActive: boolean
  vipExpiresAt: string | null
  /** Catálogo do servidor — a tela nunca repete preço nem periodicidade. */
  plans: Array<{
    period: VipBillingPeriod
    priceCents: number
    months: number
    label: string
    unitLabel: string
  }>
  subscription: {
    status: SubscriptionStatus
    isSubscriber: boolean
    canCancel: boolean
    paymentMethod: "credit_card" | "pix"
    /** Plano em vigor — decide se a tela fala em mês ou em ano. */
    billingPeriod: VipBillingPeriod
    /** Valor da cobrança deste plano, em centavos. */
    priceCents: number
    currentPeriodEnd: string | null
    canceledAt: string | null
    /** Cobrança PIX do ciclo em aberto — null no cartão ou com o mês já pago. */
    pendingPixPayment: VipPixPayment | null
    /** Checkout de cartão hospedado em aberto — null no PIX ou já concluído. */
    pendingCheckout: { link: string | null; expiresAt: string | null } | null
  } | null
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/**
 * "em 42 minutos" / "em instantes" a partir de um instante futuro.
 *
 * Devolve `null` para data ausente, inválida ou já passada — nesses casos a
 * interface simplesmente omite a linha do prazo, em vez de anunciar um
 * "expira em -3 minutos". Uma data já vencida é estado real e transitório
 * aqui: o webhook CHECKOUT_EXPIRED pode não ter chegado ainda, e a
 * reconciliação do servidor resolve isso na próxima leitura.
 */
function formatRelativeToNow(iso: string | null): string | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return null
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return "em instantes"
  if (minutes < 60) return `em ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`
  const hours = Math.round(minutes / 60)
  return `em ${hours} ${hours === 1 ? "hora" : "horas"}`
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/**
 * Vocabulário do plano em vigor. Existe para a tela não ter que repetir o
 * ternário `billingPeriod === "yearly" ? … : …` em cada frase: assim que uma
 * assinatura anual existe, cada "por mês" perdido pela tela vira uma
 * informação errada sobre quando o usuário será cobrado de novo.
 */
function planWording(period: VipBillingPeriod) {
  return period === "yearly"
    ? { unit: "/ano", cadaCiclo: "a cada 12 meses", cobranca: "anuidade" }
    : { unit: "/mês", cadaCiclo: "a cada mês", cobranca: "mensalidade" }
}

export function SubscriptionTab() {
  const [state, setState] = useState<SubscriptionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [canceling, setCanceling] = useState(false)
  const [cancelingCheckout, setCancelingCheckout] = useState(false)
  // Assinar/reassinar acontece NESTE modal, não num link para /aura. O link
  // antigo apontava para `/aura#vip` — âncora que nunca existiu — então caía
  // na Central de Aura genérica; e mesmo achando o card do VIP lá, quem tinha
  // cancelado dentro do período pago via só o selo estático "Você já é VIP",
  // sem nenhum botão. Ou seja: não havia como reassinar pela interface,
  // apesar de POST /api/vip/subscribe já suportar exatamente esse caso.
  const [upsellOpen, setUpsellOpen] = useState(false)
  // `isVip` do contexto de auth alimenta o selo do dropdown da topbar e o
  // "Seja VIP" da sidebar. Ele vem de /api/auth/me e só é reconsultado quando
  // o COOKIE de sessão muda — cancelar/assinar não mexe em cookie nenhum,
  // então sem avisar o contexto aqui essas duas UIs ficam paradas no estado
  // antigo até um F5. Ver components/providers/auth-context.tsx.
  const { refresh: refreshAuthUser } = useAuthUser()
  const router = useRouter()
  const vipParam = useSearchParams().get("vip")

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/vip/subscription")
      const data = (await res.json().catch(() => null)) as SubscriptionState | null
      if (res.ok && data) setState(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Agradecimento quando o VIP passa de inativo pra ativo — cobre tanto o
  // PIX (confirmado pelo polling abaixo) quanto o cartão (confirmado pelo
  // reload de `vip=success`, mais adiante). `null` no início é "ainda não
  // sabemos": só dispara numa transição false -> true de fato, nunca no
  // primeiro load de quem já chega VIP.
  const wasVipActiveRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (!state) return
    if (wasVipActiveRef.current === false && state.vipActive) {
      toast.success("Obrigado por assinar o VIP", {
        description: "Seu apoio nos ajuda demais a manter o projeto.",
      })
    }
    wasVipActiveRef.current = state.vipActive
  }, [state])

  // Enquanto houver uma cobrança PIX em aberto, reconsulta o estado: a
  // confirmação chega pelo webhook (fora desta aba), então sem polling o
  // usuário pagaria o QR e continuaria vendo "pague este QR" até dar F5.
  // Para quando não há mais nada pendente — não é um polling permanente.
  const hasPendingPix = state?.subscription?.pendingPixPayment != null
  // O checkout de cartão é pago em OUTRA aba (domínio da Asaas), então esta
  // tela não tem como saber que terminou — mesmo problema do QR do PIX, mesma
  // solução. Sem isso, quem paga e volta para cá continua vendo "Pagamento em
  // andamento" e o botão de cancelar um checkout que já foi pago.
  const hasPendingCheckout = state?.subscription?.pendingCheckout != null
  const shouldPoll = hasPendingPix || hasPendingCheckout
  useEffect(() => {
    if (!shouldPoll) return
    const timer = setInterval(() => {
      void load()
      refreshAuthUser()
    }, 10_000)
    return () => clearInterval(timer)
  }, [shouldPoll, load, refreshAuthUser])

  // Volta do checkout hospedado da Asaas (successUrl/cancelUrl/expiredUrl de
  // POST /api/vip/subscribe apontam para /conta?vip=…). Sem isto o assinante
  // que acabou de pagar voltava para uma página muda, sem confirmação e —
  // como o cookie de sessão não muda ao assinar — ainda sem o selo VIP.
  //
  // O acesso é liberado pelo webhook CHECKOUT_PAID, que pode chegar alguns
  // segundos depois do redirect. Por isso o sucesso reconsulta o estado uma
  // segunda vez, curto, em vez de afirmar de cara que já está tudo ativo.
  useEffect(() => {
    if (!vipParam) return

    if (vipParam === "success") {
      toast.success("Pagamento recebido!", {
        description: "Estamos confirmando com a Asaas — seu VIP aparece em instantes.",
      })
      const timer = setTimeout(() => {
        void load()
        refreshAuthUser()
      }, 4000)
      router.replace("/conta#assinatura", { scroll: false })
      return () => clearTimeout(timer)
    }

    if (vipParam === "expired") {
      toast.error("Checkout expirado", {
        description: "A página de pagamento expirou. Você pode iniciar a assinatura de novo.",
      })
    } else if (vipParam === "cancel") {
      toast("Pagamento não concluído", {
        description: "Nenhuma cobrança foi feita. Você pode assinar quando quiser.",
      })
    }
    router.replace("/conta#assinatura", { scroll: false })
  }, [vipParam, load, refreshAuthUser, router])

  /**
   * Desiste do checkout hospedado em aberto (cartão, ainda não pago).
   *
   * Endpoint SEPARADO de `/api/vip/cancel`: aquele faz
   * `DELETE /v3/subscriptions/{id}`, e neste estado a assinatura ainda não
   * existe na Asaas — o id só nasce no 1º pagamento.
   */
  async function handleCancelCheckout() {
    setCancelingCheckout(true)
    try {
      const res = await fetch("/api/vip/checkout/cancel", { method: "POST" })
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; code?: string }
        | null
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Não foi possível cancelar o checkout.")
      }
      toast.success("Checkout cancelado", {
        description: "Nenhuma cobrança foi feita. Você pode assinar quando quiser.",
      })
      await load()
      // A trava de "assinatura em andamento" foi liberada: a sidebar e o
      // dropdown precisam voltar a oferecer "Seja VIP".
      refreshAuthUser()
    } catch (err) {
      toast.error("Erro ao cancelar", {
        description: err instanceof Error ? err.message : "Tente novamente em alguns minutos.",
      })
    } finally {
      setCancelingCheckout(false)
    }
  }

  async function handleCancel() {
    setCanceling(true)
    try {
      const res = await fetch("/api/vip/cancel", { method: "POST" })
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; accessUntil?: string | null }
        | null
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Não foi possível cancelar a assinatura.")
      }
      const until = formatDate(data.accessUntil ?? null)
      toast.success("Assinatura cancelada", {
        description: until
          ? `Seu VIP continua ativo até ${until}. Não haverá nova cobrança.`
          : "Não haverá nova cobrança.",
      })
      await load()
      // Propaga para a topbar/sidebar. Cancelar normalmente NÃO tira o VIP na
      // hora (o período já pago continua valendo), então na maioria das vezes
      // o selo segue lá — corretamente. Mas quando o acesso de fato termina
      // agora (assinatura `past_due`, cujo ciclo não foi pago), é isto que
      // faz o selo sumir e o "Seja VIP" voltar sem precisar recarregar.
      refreshAuthUser()
    } catch (err) {
      toast.error("Erro ao cancelar", {
        description: err instanceof Error ? err.message : "Tente novamente em alguns minutos.",
      })
    } finally {
      setCanceling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-4 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Carregando assinatura…
      </div>
    )
  }

  if (!state) {
    return (
      <div className="rounded-lg border border-border/60 bg-secondary/30 px-4 py-6 text-sm text-muted-foreground">
        Não foi possível carregar sua assinatura agora.
      </div>
    )
  }

  const sub = state.subscription
  // Vocabulário e preço do plano CONTRATADO (não de um preço global): é o que
  // decide se esta tela fala em mês ou em ano, e quanto a próxima cobrança vai
  // custar. `monthly` como fallback só cobre a ausência de assinatura.
  const words = planWording(sub?.billingPeriod ?? "monthly")
  const subPrice = sub?.priceCents ?? 0
  // Plano de ENTRADA para quem ainda não assina: o mais barato do catálogo, que
  // é o valor que o CTA promete antes de a pessoa escolher no modal.
  const entryPlan = state.plans.reduce(
    (cheapest, plan) => (plan.priceCents < cheapest.priceCents ? plan : cheapest),
    state.plans[0]
  )
  const renewsOn = formatDate(sub?.currentPeriodEnd ?? null)
  const vipUntil = formatDate(state.vipExpiresAt)
  // Prazo restante do checkout hospedado. Relativo ("em 42 minutos") e não
  // absoluto: o checkout dura ~1h, e um horário exato obrigaria o usuário a
  // comparar com o relógio dele para saber se ainda dá tempo.
  const checkoutExpiresIn = formatRelativeToNow(sub?.pendingCheckout?.expiresAt ?? null)

  // ── Assinante ativo (paga em dia) ────────────────────────────────────────
  if (sub?.isSubscriber && sub.status === "active") {
    return (
      <Card className={cn(CARD_SURFACE_INTERACTIVE, "transition-colors")}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Crown className="size-4" style={{ color: "var(--vip-accent)" }} />
            <CardTitle className="text-base">Assinatura VIP ativa</CardTitle>
          </div>
          <CardDescription>
            {formatBRL(subPrice)}
            {words.unit}
            {renewsOn ? ` · próxima renovação em ${renewsOn}` : ""}.
            {sub.paymentMethod === "pix"
              ? ` Pagamento via PIX: ${words.cadaCiclo} geramos uma nova cobrança para você pagar.`
              : " Renova automaticamente no cartão cadastrado."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* No PIX a renovação NÃO é automática: a Asaas gera o QR do ciclo
              e o usuário paga. Mostrar aqui é o que torna a assinatura PIX
              utilizável — sem isto ele não teria onde pagar o mês seguinte. */}
          {sub.pendingPixPayment && <VipPixCharge payment={sub.pendingPixPayment} />}
          <BenefitsList />
          <CancelDialog canceling={canceling} onConfirm={handleCancel} accessUntil={renewsOn} />
        </CardContent>
      </Card>
    )
  }

  // ── Assinante com pagamento atrasado ────────────────────────────────────
  if (sub?.isSubscriber && sub.status === "past_due") {
    return (
      <Card className={cn(CARD_SURFACE_INTERACTIVE, "transition-colors")}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Crown className="size-4" style={{ color: "var(--vip-accent)" }} />
            <CardTitle className="text-base">Pagamento pendente</CardTitle>
          </div>
          <CardDescription>
            A última cobrança de {formatBRL(subPrice)} não foi confirmada.
            {sub.paymentMethod === "pix"
              ? " Pague o PIX abaixo para regularizar."
              : " A Asaas vai tentar de novo automaticamente no cartão cadastrado."}
            {vipUntil ? ` Seu VIP segue ativo até ${vipUntil}.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sub.pendingPixPayment && <VipPixCharge payment={sub.pendingPixPayment} />}
          <p className="text-xs text-muted-foreground">
            Se a cobrança não for regularizada até essa data, o VIP é encerrado. Você pode cancelar a
            assinatura agora se preferir não continuar.
          </p>
          <CancelDialog canceling={canceling} onConfirm={handleCancel} accessUntil={vipUntil} />
        </CardContent>
      </Card>
    )
  }

  // ── Aguardando o 1º pagamento ───────────────────────────────────────────
  // PIX e cartão são situações diferentes aqui. No PIX a assinatura JÁ existe
  // na Asaas e há um QR concreto para pagar (e para cancelar, se desistir).
  // No cartão é só um checkout hospedado em aberto, que expira sozinho.
  if (sub?.isSubscriber && sub.status === "pending") {
    if (sub.paymentMethod === "pix") {
      return (
        <Card className={cn(CARD_SURFACE_INTERACTIVE, "transition-colors")}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown className="size-4" style={{ color: "var(--vip-accent)" }} />
              <CardTitle className="text-base">Assinatura aguardando pagamento</CardTitle>
            </div>
            <CardDescription>
              {formatBRL(subPrice)}
              {words.unit} via PIX. Seu VIP é liberado assim que a primeira cobrança for
              confirmada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sub.pendingPixPayment ? (
              <VipPixCharge payment={sub.pendingPixPayment} isFirstCharge />
            ) : (
              <p className="text-sm text-muted-foreground">
                Estamos gerando a primeira cobrança. Recarregue em instantes.
              </p>
            )}
            {sub.canCancel && (
              <CancelDialog canceling={canceling} onConfirm={handleCancel} accessUntil={null} />
            )}
          </CardContent>
        </Card>
      )
    }

    // CARTÃO: checkout hospedado em aberto. Este ramo já foi um texto sem
    // nenhuma ação ("aguarde ele expirar") — e era um beco sem saída de
    // verdade: `/subscribe` recusava com 409 pela trava de assinatura em
    // andamento e `/cancel` devolvia 404 (sem assinatura na Asaas, não há o
    // que cancelar). O usuário ficava até uma hora sem poder pagar nem
    // desistir — e para sempre, se o webhook CHECKOUT_EXPIRED se perdesse.
    const checkoutLink = sub.pendingCheckout?.link ?? null
    return (
      <Card className={cn(CARD_SURFACE_INTERACTIVE, "transition-colors")}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Crown className="size-4" style={{ color: "var(--vip-accent)" }} />
            <CardTitle className="text-base">
              {state.vipActive ? "Renovação em andamento" : "Pagamento em andamento"}
            </CardTitle>
          </div>
          <CardDescription>
            {/* Reativação de quem ainda tem período pago correndo é diferente
                de assinar do zero: o VIP está VALENDO agora, e o checkout só
                cadastra o cartão para a cobrança do fim do período. Mostrar
                "nenhuma cobrança foi feita" sem dizer isso fazia um VIP ativo
                achar que tinha perdido o acesso. */}
            {state.vipActive ? (
              <>
                Seu VIP está ativo{vipUntil ? ` até ${vipUntil}` : ""} — nada mudou nele. Você abriu a
                página para cadastrar o cartão da renovação de {formatBRL(subPrice)}
                {words.unit} e ela ainda não foi concluída.
              </>
            ) : (
              <>
                {formatBRL(subPrice)}
                {words.unit} no cartão. Você abriu a página de pagamento e ela ainda não foi
                concluída — nenhuma cobrança foi feita até aqui.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {checkoutExpiresIn && (
            <p className="text-sm text-muted-foreground">
              A página de pagamento expira {checkoutExpiresIn}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {checkoutLink && (
              <Button asChild size="sm">
                {/* Link externo para o domínio da Asaas: `rel` explícito porque
                    `target="_blank"` sem `noopener` daria à página aberta acesso
                    a `window.opener`. */}
                <a href={checkoutLink} target="_blank" rel="noopener noreferrer">
                  Continuar pagamento
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelCheckout}
              disabled={cancelingCheckout}
            >
              {cancelingCheckout && <Loader2 className="mr-2 size-4 animate-spin" />}
              Cancelar checkout
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cancelar aqui não gera cobrança nem estorno — o cartão nem chegou a ser cadastrado.
            {state.vipActive
              ? " Seu VIP atual continua valendo normalmente até o fim do período já pago."
              : " Você pode assinar de novo quando quiser."}
          </p>
        </CardContent>
      </Card>
    )
  }

  // ── Não é assinante ─────────────────────────────────────────────────────
  // Mesma resolução que a sidebar e o menu da conta usam, a partir dos dados
  // frescos de /api/vip/subscription em vez dos de /api/auth/me. As duas
  // fontes passam pela MESMA função, então não têm como discordar sobre o
  // que oferecer — antes esta tela derivava o estado por conta própria e
  // dizia "Reativar assinatura" enquanto a sidebar dizia "Renovar VIP".
  const vipStatus = resolveVipStatus({
    accountTier: state.vipActive ? "vip" : "common",
    // `vipActive` já resolveu a expiração no servidor; passar a data crua
    // aqui reintroduziria uma segunda comparação de relógio.
    vipExpiresAt: null,
    subscriptionStatus: sub?.status ?? null,
  })
  // Cancelou e o período já pago ainda está correndo. É um estado próprio, e
  // precisa vir ANTES de `state.vipActive`: sem isto o card dizia "VIP ativo
  // (sem assinatura) — ativado com Aura ou concedido pela equipe" para quem
  // tinha acabado de cancelar uma assinatura de cartão, o que é simplesmente
  // falso, e ainda oferecia "Assinar" — o mesmo botão que devolve 409
  // enquanto o acesso atual não vence.
  const canceledWithAccessLeft = vipStatus.canReactivate

  if (canceledWithAccessLeft) {
    return (
      <Card className={cn(CARD_SURFACE_INTERACTIVE, "transition-colors")}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Crown className="size-4" style={{ color: "var(--vip-accent)" }} />
            <CardTitle className="text-base">Assinatura cancelada</CardTitle>
          </div>
          <CardDescription>
            Não haverá nova cobrança
            {sub?.canceledAt ? ` (cancelada em ${formatDate(sub.canceledAt)})` : ""}.
            {vipUntil
              ? ` Seu VIP continua ativo até ${vipUntil} — o período que você já pagou não é perdido.`
              : " Seu VIP continua ativo até o fim do período já pago."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <BenefitsList />
          {state.subscriptionEnabled && (
            <Button
              onClick={() => setUpsellOpen(true)}
              style={{ backgroundColor: "var(--vip-accent)", color: "#000" }}
            >
              <Crown className="size-4" />
              Reativar assinatura
            </Button>
          )}
          {/* "Reativar", nunca "Renovar"/"Assinar": o VIP ainda está valendo e
              NADA é cobrado agora. Reativar só desfaz o cancelamento — a
              cobrança volta a acontecer no fim do período que já foi pago.
              Dizer "assinar por R$ 8,90" aqui sugeria um pagamento imediato
              que não acontece mais. */}
          <p className="text-xs text-muted-foreground">
            {/* O plano pode ser TROCADO na reativação (o modal oferece os dois),
                então esta frase fala do valor do plano anterior como referência
                e o modal confirma o escolhido. Em nenhum dos casos há cobrança
                agora. */}
            {vipUntil
              ? `Nenhuma cobrança agora — seu VIP já está pago até ${vipUntil}. Reativando, a ${words.cobranca} de ${formatBRL(subPrice)} volta a ser cobrada só a partir dessa data.`
              : `Nenhuma cobrança agora — o período atual já está pago. Reativando, a ${words.cobranca} de ${formatBRL(subPrice)} volta a ser cobrada só quando ele terminar.`}
          </p>
          <p className="text-xs text-muted-foreground">
            {vipUntil
              ? `Sem reativar, a partir de ${vipUntil} sua conta volta ao plano comum.`
              : "Sem reativar, quando o período terminar sua conta volta ao plano comum."}
          </p>
          <VipUpsellModal
            open={upsellOpen}
            onOpenChange={setUpsellOpen}
            mode="resubscribe"
            currentAccessUntil={vipUntil}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(CARD_SURFACE_INTERACTIVE, "transition-colors")}>
      <CardHeader>
        <CardTitle className="text-base">
          {state.vipActive ? "VIP ativo (sem assinatura)" : "Você não tem uma assinatura VIP"}
        </CardTitle>
        <CardDescription>
          {state.vipActive
            ? `Seu VIP${vipUntil ? ` vale até ${vipUntil}` : ""} e não renova sozinho — foi ativado com Aura ou concedido pela equipe.`
            : vipStatus.state === "lapsed"
              ? "Sua assinatura anterior foi cancelada. Você pode assinar de novo quando quiser."
              : "Assine para manter o VIP renovando sozinho, no plano mensal ou anual, sem precisar gastar Aura."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <BenefitsList />
        {state.subscriptionEnabled ? (
          <Button
            onClick={() => setUpsellOpen(true)}
            style={{ backgroundColor: "var(--vip-accent)", color: "#000" }}
          >
            <Crown className="size-4" />
            {/* Preço do plano de ENTRADA, com "a partir de": o modal oferece
                mensal e anual, e prometer um valor exato aqui contradiria a
                escolha que vem na tela seguinte. */}
            A partir de {formatBRL(entryPlan.priceCents)}
            {entryPlan.unitLabel}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            A assinatura paga está temporariamente indisponível. Você ainda pode ativar o
            VIP com Aura na{" "}
            <Link href="/aura" className="underline underline-offset-2">
              Central de Aura
            </Link>
            .
          </p>
        )}
        <VipUpsellModal open={upsellOpen} onOpenChange={setUpsellOpen} />
      </CardContent>
    </Card>
  )
}

function BenefitsList() {
  return (
    <ul className="space-y-1.5">
      {vipSubscriptionBenefits().map((benefit) => (
        <li key={benefit} className="flex items-start gap-2 text-xs text-muted-foreground">
          <Crown className="mt-0.5 size-3 shrink-0" style={{ color: "var(--vip-accent)" }} />
          <span>{benefit}</span>
        </li>
      ))}
    </ul>
  )
}

function CancelDialog({
  canceling,
  onConfirm,
  accessUntil,
}: {
  canceling: boolean
  onConfirm: () => void
  accessUntil: string | null
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive" disabled={canceling}>
          {canceling ? <Loader2 className="size-4 animate-spin" /> : <ShieldX className="size-4" />}
          Cancelar assinatura
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar a assinatura VIP?</AlertDialogTitle>
          <AlertDialogDescription>
            {accessUntil
              ? `Seu VIP continua ativo até ${accessUntil} — o período que você já pagou não é perdido. A partir daí não há nova cobrança e a conta volta ao plano comum.`
              : "Não haverá nova cobrança e a conta volta ao plano comum ao fim do período já pago."}
            {" "}Sua tierlist pessoal continua salva e visível; só a edição fica bloqueada sem VIP ativo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={canceling}>Manter assinatura</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={canceling}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {canceling && <Loader2 className="size-4 animate-spin" />}
            Cancelar assinatura
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
