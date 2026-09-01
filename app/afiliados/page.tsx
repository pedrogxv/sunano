import Link from "next/link"
import { redirect } from "next/navigation"
import { Handshake } from "lucide-react"

import { AffiliateShareButton } from "@/components/affiliates/AffiliateShareButton"
import { EditReferralCodeDialog } from "@/components/affiliates/EditReferralCodeDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buildAffiliateLink } from "@/lib/affiliate-code"
import { getAffiliateByUserId, getAffiliateSummary } from "@/lib/server/repositories/affiliates-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { SITE_URL } from "@/lib/site-url"

export const dynamic = "force-dynamic"

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export default async function AfiliadosPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/afiliados")
  }

  const affiliate = await getAffiliateByUserId(user.id)

  if (!affiliate) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10">
          <Handshake className="size-7 text-primary" />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Programa de Afiliados</h1>
        <p className="mt-3 text-muted-foreground">
          Indique a loja Sunano com seu link próprio e receba 5% de comissão em cada venda
          confirmada dentro de 30 dias da indicação.
        </p>
        <Button asChild className="mt-6">
          <Link href="/afiliados/solicitar">Quero ser afiliado</Link>
        </Button>
      </div>
    )
  }

  if (affiliate.status === "pending") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Badge variant="outline" className="mb-4">Em análise</Badge>
        <h1 className="font-display text-3xl font-bold tracking-tight">Solicitação enviada</h1>
        <p className="mt-3 text-muted-foreground">
          Sua solicitação de afiliação está em análise. Avisaremos assim que houver uma decisão.
        </p>
      </div>
    )
  }

  if (affiliate.status === "rejected") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Badge variant="destructive" className="mb-4">Solicitação recusada</Badge>
        <h1 className="font-display text-3xl font-bold tracking-tight">Não foi dessa vez</h1>
        {affiliate.rejection_reason && (
          <p className="mt-3 text-muted-foreground">Motivo: {affiliate.rejection_reason}</p>
        )}
        <Button asChild className="mt-6">
          <Link href="/afiliados/solicitar">Enviar nova solicitação</Link>
        </Button>
      </div>
    )
  }

  if (affiliate.status === "suspended") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Badge variant="destructive" className="mb-4">Suspenso</Badge>
        <h1 className="font-display text-3xl font-bold tracking-tight">Cadastro suspenso</h1>
        <p className="mt-3 text-muted-foreground">
          Seu cadastro de afiliado está suspenso e não está gerando novas comissões no momento.
        </p>
      </div>
    )
  }

  const summary = await getAffiliateSummary(affiliate.id)
  const referralLink = buildAffiliateLink(SITE_URL, affiliate.code!)

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Painel do Afiliado</h1>
        <p className="mt-1 text-muted-foreground">
          Comissão de {(affiliate.commission_bps / 100).toLocaleString("pt-BR")}% sobre vendas confirmadas.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Saldo disponível</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatCents(summary.balanceCents)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Já sacado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatCents(summary.totalPaidCents)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total ganho</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatCents(summary.totalEarnedCents)}</CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>Seu link de indicação</CardTitle>
          {affiliate.code && <EditReferralCodeDialog currentCode={affiliate.code} />}
        </CardHeader>
        <CardContent className="space-y-3">
          <code className="block break-all rounded-lg bg-muted px-3 py-2 text-sm">{referralLink}</code>
          <AffiliateShareButton path="/" label="Copiar link" />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/afiliados/extrato">Ver extrato</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/afiliados/saques">Solicitar saque</Link>
        </Button>
      </div>
    </div>
  )
}
