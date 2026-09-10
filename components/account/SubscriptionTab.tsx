"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
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
import { CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import { cn } from "@/lib/utils"
import { VIP_SUBSCRIPTION_BENEFITS } from "@/lib/vip-plan"

type SubscriptionStatus = "pending" | "active" | "past_due" | "canceled" | "expired"

interface SubscriptionState {
  subscriptionEnabled: boolean
  vipActive: boolean
  vipExpiresAt: string | null
  priceCents: number
  subscription: {
    status: SubscriptionStatus
    isSubscriber: boolean
    canCancel: boolean
    currentPeriodEnd: string | null
    canceledAt: string | null
  } | null
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function SubscriptionTab() {
  const [state, setState] = useState<SubscriptionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [canceling, setCanceling] = useState(false)
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
  const renewsOn = formatDate(sub?.currentPeriodEnd ?? null)
  const vipUntil = formatDate(state.vipExpiresAt)

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
            {formatBRL(state.priceCents)}/mês
            {renewsOn ? ` · próxima renovação em ${renewsOn}` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
            A última cobrança de {formatBRL(state.priceCents)} não foi confirmada. A Asaas vai tentar
            de novo automaticamente no cartão cadastrado.
            {vipUntil ? ` Seu VIP segue ativo até ${vipUntil}.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Se a cobrança não for regularizada até essa data, o VIP é encerrado. Você pode cancelar a
            assinatura agora se preferir não continuar.
          </p>
          <CancelDialog canceling={canceling} onConfirm={handleCancel} accessUntil={vipUntil} />
        </CardContent>
      </Card>
    )
  }

  // ── Checkout em aberto (pending sem confirmação) ────────────────────────
  if (sub?.isSubscriber && sub.status === "pending") {
    return (
      <div className="rounded-lg border border-border/60 bg-secondary/30 px-4 py-4 text-sm text-muted-foreground">
        Há um checkout de assinatura em aberto aguardando o pagamento. Assim que a Asaas confirmar, sua
        assinatura aparece aqui. Se você desistiu, o checkout expira sozinho e nenhuma cobrança é feita.
      </div>
    )
  }

  // ── Não é assinante ─────────────────────────────────────────────────────
  const wasCanceled = sub?.status === "canceled" || sub?.status === "expired"
  // Cancelou e o período já pago ainda está correndo. É um estado próprio, e
  // precisa vir ANTES de `state.vipActive`: sem isto o card dizia "VIP ativo
  // (sem assinatura) — ativado com Aura ou concedido pela equipe" para quem
  // tinha acabado de cancelar uma assinatura de cartão, o que é simplesmente
  // falso, e ainda oferecia "Assinar" — o mesmo botão que devolve 409
  // enquanto o acesso atual não vence.
  const canceledWithAccessLeft = wasCanceled && state.vipActive

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
              Voltar a assinar por {formatBRL(state.priceCents)}/mês
            </Button>
          )}
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
            : wasCanceled
              ? "Sua assinatura anterior foi cancelada. Você pode assinar de novo quando quiser."
              : "Assine para manter o VIP renovando todo mês, sem precisar gastar Aura."}
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
            Assinar por {formatBRL(state.priceCents)}/mês
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            A assinatura mensal por cartão está temporariamente indisponível. Você ainda pode ativar o
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
      {VIP_SUBSCRIPTION_BENEFITS.map((benefit) => (
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
