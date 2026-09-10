import Link from "next/link"
import { redirect } from "next/navigation"
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  Handshake,
  MousePointerClick,
  Receipt,
  ShoppingBag,
  Wallet,
} from "lucide-react"

import { AffiliateShareButton } from "@/components/affiliates/AffiliateShareButton"
import { EditReferralCodeDialog } from "@/components/affiliates/EditReferralCodeDialog"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buildAffiliateLink } from "@/lib/affiliate-code"
import { MAX_PENDING_PAYOUTS, MIN_PAYOUT_CENTS } from "@/lib/affiliate-payout"
import {
  getAffiliateByUserId,
  getAffiliateSalesStats,
  getAffiliateSummary,
} from "@/lib/server/repositories/affiliates-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { SITE_URL } from "@/lib/site-url"

export const dynamic = "force-dynamic"

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/** Janela de atribuição do cookie `sn_aff_ref` (proxy.ts) — em dias, para a UI. */
const ATTRIBUTION_DAYS = 30

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
          confirmada dentro de {ATTRIBUTION_DAYS} dias da indicação.
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
        {affiliate.code && (
          <p className="mt-4 text-sm text-muted-foreground">
            Seu código <strong className="text-foreground">{affiliate.code}</strong> já está
            reservado; ninguém mais pode usá-lo enquanto sua solicitação estiver em análise.
          </p>
        )}
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
        {affiliate.rejection_reason && (
          <p className="mt-3 text-sm text-muted-foreground">Motivo: {affiliate.rejection_reason}</p>
        )}
        <p className="mt-4 text-sm text-muted-foreground">
          Se você tinha saldo, ele continua registrado; fale com o suporte para resolver a
          situação e voltar a sacar.
        </p>
      </div>
    )
  }

  const [summary, stats] = await Promise.all([
    getAffiliateSummary(affiliate.id),
    getAffiliateSalesStats(affiliate.id),
  ])

  const referralLink = buildAffiliateLink(SITE_URL, affiliate.code!)
  const commissionPercent = (affiliate.commission_bps / 100).toLocaleString("pt-BR")

  // Mesmo cálculo do servidor em /api/afiliados/me: o que dá para sacar agora
  // é o saldo menos o que já está reservado em saques em análise.
  const availableCents = Math.max(summary.balanceCents - summary.totalRequestedPendingCents, 0)
  const missingToMinimum = MIN_PAYOUT_CENTS - availableCents

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Painel do Afiliado</h1>
          <p className="mt-1 text-muted-foreground">
            Você ganha <strong className="text-foreground">{commissionPercent}%</strong> de cada
            venda confirmada que vier do seu link.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <BadgeCheck className="size-3.5" /> Afiliado ativo
        </Badge>
      </div>

      {/* Link primeiro: é a única coisa que o afiliado precisa levar embora. */}
      <Card className="mb-6 border-primary/30 bg-primary/[0.03]">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>Seu link de indicação</CardTitle>
          {affiliate.code && <EditReferralCodeDialog currentCode={affiliate.code} />}
        </CardHeader>
        <CardContent className="space-y-3">
          <code className="block break-all rounded-lg bg-muted px-3 py-2 text-sm">{referralLink}</code>
          <div className="flex flex-wrap items-center gap-3">
            <AffiliateShareButton path="/" label="Copiar link" />
            <p className="text-xs text-muted-foreground">
              Vale para qualquer página do site; copie o link de um produto específico pelo botão
              que aparece na própria página dele.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wallet className="size-4" /> Disponível para saque
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{formatCents(availableCents)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {availableCents >= MIN_PAYOUT_CENTS
                ? "Você já pode solicitar um saque."
                : `Faltam ${formatCents(missingToMinimum)} para o saque mínimo.`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Receipt className="size-4" /> Total ganho
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{formatCents(summary.totalEarnedCents)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatCents(summary.totalPaidCents)} já pagos a você.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ShoppingBag className="size-4" /> Vendas pelo seu link
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{stats.paidOrders}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.lastSaleAt
                ? `Última em ${new Date(stats.lastSaleAt).toLocaleDateString("pt-BR")}.`
                : "Nenhuma venda confirmada ainda."}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Só aparece quando existe: uma linha de "0 pendentes" não informa nada. */}
      {stats.pendingOrders > 0 && (
        <Card className="mb-6 border-dashed">
          <CardContent className="flex items-start gap-3 py-4">
            <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">
                {stats.pendingOrders}{" "}
                {stats.pendingOrders === 1 ? "pedido aguardando pagamento" : "pedidos aguardando pagamento"}
              </strong>{" "}
              vieram do seu link. Se forem pagos, viram{" "}
              {formatCents(stats.pendingCommissionCents)} de comissão, valor que só entra no seu
              saldo depois que o pagamento é confirmado.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="mb-10 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/afiliados/saques">
            Solicitar saque <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/afiliados/extrato">Ver extrato</Link>
        </Button>
      </div>

      {/* ── Como funciona ─────────────────────────────────────────────────── */}
      <h2 className="mb-4 font-display text-xl font-bold tracking-tight">Como funciona</h2>
      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: MousePointerClick,
            title: "1. Você compartilha",
            body: `Mande seu link para quem quiser. Quando a pessoa abre o site por ele, fica registrado no navegador dela por ${ATTRIBUTION_DAYS} dias.`,
          },
          {
            icon: ShoppingBag,
            title: "2. A pessoa compra",
            body: `Qualquer compra que ela finalizar dentro desses ${ATTRIBUTION_DAYS} dias conta como sua indicação, mesmo que ela não use o link de novo.`,
          },
          {
            icon: Wallet,
            title: "3. Você recebe",
            body: `Assim que o pagamento é confirmado, ${commissionPercent}% entram no seu saldo. A partir de ${formatCents(MIN_PAYOUT_CENTS)} você pede o saque por PIX.`,
          },
        ].map((step) => (
          <Card key={step.title}>
            <CardContent className="space-y-2 py-5">
              <div className="flex size-9 items-center justify-center rounded-full bg-primary/10">
                <step.icon className="size-4 text-primary" />
              </div>
              <p className="font-semibold">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <h2 className="mb-4 font-display text-xl font-bold tracking-tight">Perguntas frequentes</h2>
      <Accordion type="single" collapsible className="mb-6">
        <AccordionItem value="quando-recebo">
          <AccordionTrigger>Quando a comissão entra no meu saldo?</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">
            Só quando o pagamento do pedido é confirmado. Pedido com PIX gerado e ainda não pago
            não gera comissão; se ele expirar ou for cancelado, nada entra. É por isso que o
            painel separa &ldquo;vendas confirmadas&rdquo; de &ldquo;pedidos aguardando
            pagamento&rdquo;.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="sobre-o-que">
          <AccordionTrigger>A comissão é sobre qual valor?</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">
            Sobre o valor dos produtos no preço à vista (PIX). Quando o cliente escolhe cartão, o
            acréscimo cobrado pela operadora não entra na conta: ele é repassado ao gateway de
            pagamento e não é receita da loja, então sua comissão é a mesma nos dois casos.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="prazo">
          <AccordionTrigger>Por quanto tempo minha indicação vale?</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">
            {ATTRIBUTION_DAYS} dias a partir do momento em que a pessoa abre o site pelo seu link.
            Dentro desse prazo, qualquer compra dela é sua, não precisa clicar de novo. Se ela
            abrir o site pelo link de outro afiliado nesse meio-tempo, a indicação passa a ser da
            pessoa mais recente. A contagem é por navegador: se ela comprar de outro aparelho sem
            usar seu link, a venda não é atribuída.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="proprias-compras">
          <AccordionTrigger>Posso usar meu próprio link para comprar?</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">
            Não. Compras feitas por você não geram comissão: a verificação é pela conta e também
            pelo CPF do pagador, então criar uma segunda conta não contorna a regra. A compra
            acontece normalmente, ela apenas não é atribuída a você. Tentar burlar isso pode levar
            à suspensão do cadastro.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="estorno">
          <AccordionTrigger>E se o cliente pedir reembolso?</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">
            A comissão daquela venda é descontada do seu saldo, proporcionalmente ao valor
            devolvido; reembolso parcial desconta só a parte correspondente. O mesmo vale se o
            cliente abrir uma disputa no cartão (chargeback): o valor sai do seu saldo quando a
            disputa é aberta e volta se a loja vencer. Tudo isso aparece no seu extrato como
            &ldquo;Estorno&rdquo;.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="saque">
          <AccordionTrigger>Como funciona o saque?</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">
            O mínimo é {formatCents(MIN_PAYOUT_CENTS)} e você pode ter até {MAX_PENDING_PAYOUTS}{" "}
            pedidos em análise ao mesmo tempo. O pagamento é feito por PIX para a chave que você
            informar no momento do saque; confira com atenção, porque o envio é exatamente para
            ela. Enquanto o saque está em análise, o valor fica reservado e sai do
            &ldquo;disponível&rdquo;. Você pode cancelar um saque a qualquer momento antes de ele
            ser processado, e o valor volta na hora.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="codigo">
          <AccordionTrigger>Posso mudar meu código de indicação?</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">
            Pode, pelo botão ao lado do seu link. Só que os links antigos param de funcionar na
            hora: quem abrir um link com o código anterior não será atribuído a você. Se você já
            divulgou o link em algum lugar, vale trocar só se puder atualizar a divulgação também.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="imposto">
          <AccordionTrigger>Preciso declarar esse valor?</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">
            A comissão é rendimento seu, e a responsabilidade pela declaração é de quem recebe. A
            Sunano não retém impostos sobre o valor pago. Em caso de dúvida sobre como declarar,
            consulte um contador.
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <p className="text-sm text-muted-foreground">
        Ficou alguma dúvida?{" "}
        <Link href="/suporte" className="font-medium text-primary underline-offset-4 hover:underline">
          Fale com o suporte
        </Link>
        .
      </p>
    </div>
  )
}
