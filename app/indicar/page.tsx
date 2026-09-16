import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  BadgeCheck,
  Clock,
  Gift,
  Hourglass,
  Sparkles,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react"

import { EditReferralCodeDialog } from "@/components/referrals/EditReferralCodeDialog"
import { ReferralLinkBox } from "@/components/referrals/ReferralLinkBox"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
  REFERRAL_MAX_PER_USER,
  REFERRAL_REWARD_DIRECT,
  REFERRAL_REWARD_INDIRECT,
  REFERRAL_STREAK_DAYS,
  REFERRAL_VALIDATION_DAYS,
  buildReferralLink,
} from "@/lib/referral-code"
import { buildMetadata } from "@/lib/seo"
import {
  getReferralStats,
  listMyReferrals,
  type ReferralListItem,
} from "@/lib/server/repositories/referrals-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { SITE_URL } from "@/lib/site-url"

// Painel por conta, nada indexável. `noIndex` porque o robots.txt só impede o
// rastreio — uma URL linkada de fora ainda entraria no índice sem ele.
export const metadata: Metadata = buildMetadata({
  title: "Indicar amigos",
  description: "Indique amigos para a Sunano e ganhe Aura.",
  path: "/indicar",
  noIndex: true,
})

export const dynamic = "force-dynamic"

const STATUS_LABEL: Record<ReferralListItem["status"], { label: string; icon: typeof BadgeCheck; className: string }> = {
  validated: { label: "Confirmado", icon: BadgeCheck, className: "text-green-500" },
  pending: { label: "Aguardando", icon: Hourglass, className: "text-amber-500" },
  rejected: { label: "Não validado", icon: XCircle, className: "text-muted-foreground" },
  expired: { label: "Expirado", icon: Clock, className: "text-muted-foreground" },
}

const VIA_LABEL: Record<string, string> = {
  discord_member: "entrou no Discord",
  oauth_identity: "conectou uma conta",
  streak_3d: `fez ${REFERRAL_STREAK_DAYS} dias de ofensiva`,
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

export default async function IndicarPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/indicar")
  }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from("user_profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle()

  const [stats, referrals] = await Promise.all([
    getReferralStats(user.id, profile?.display_name ?? null),
    listMyReferrals(user.id),
  ])

  const link = stats.code ? buildReferralLink(SITE_URL, stats.code) : null

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Gift className="size-6 text-primary" />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Indique e ganhe Aura</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Chame seus amigos para a Sunano. Cada amigo que se cadastrar e{" "}
          <strong className="text-foreground">confirmar a conta</strong> vale{" "}
          <strong className="text-foreground">{REFERRAL_REWARD_DIRECT} de Aura</strong> para você, e
          se ele também indicar alguém, você ganha mais{" "}
          <strong className="text-foreground">{REFERRAL_REWARD_INDIRECT}</strong>.
        </p>
      </div>

      {/* O link vem primeiro: é a única coisa que a pessoa precisa levar embora. */}
      <Card className="mb-6 border-primary/30 bg-primary/[0.03]">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>Seu link de indicação</CardTitle>
          {stats.code && stats.canCustomizeCode && (
            <EditReferralCodeDialog currentCode={stats.code} />
          )}
        </CardHeader>
        <CardContent>
          {link && stats.code ? (
            <ReferralLinkBox link={link} code={stats.code} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Não foi possível gerar seu cupom agora. Recarregue a página.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <BadgeCheck className="size-4" /> Confirmadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{stats.validated}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              de até {REFERRAL_MAX_PER_USER} indicações
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Hourglass className="size-4" /> Aguardando
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{stats.pending}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              já se cadastraram, falta confirmar a conta
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="size-4" /> Aura ganha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{stats.auraEarned}</p>
            <p className="mt-1 text-xs text-muted-foreground">somando os dois níveis</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de indicados: o painel precisa dizer o que FALTA, não só o status. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-primary" />
            Quem você indicou
          </CardTitle>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <div className="py-8 text-center">
              <UserPlus className="mx-auto mb-3 size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Ninguém ainda. Compartilhe seu link para começar.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {referrals.map((item) => {
                const status = STATUS_LABEL[item.status]
                const StatusIcon = status.icon
                return (
                  <li key={item.userId} className="flex items-center gap-3 py-3">
                    <UserAvatar name={item.displayName} avatarUrl={item.avatarUrl} size={9} frame={item.frame} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.displayName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.status === "validated" && item.validatedVia
                          ? `Confirmado: ${VIA_LABEL[item.validatedVia] ?? "conta verificada"}`
                          : item.status === "pending"
                            ? `Precisa confirmar até ${formatDate(item.expiresAt)}`
                            : `Cadastrou em ${formatDate(item.createdAt)}`}
                      </p>
                    </div>
                    <span className={`flex items-center gap-1.5 text-xs font-medium ${status.className}`}>
                      <StatusIcon className="size-3.5" />
                      {status.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Central de Indicação: a mecânica inteira, explicada ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como funciona a indicação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Step
              number={1}
              title="Compartilhe"
              description="Mande seu link ou dite seu cupom. Quem usar o link já chega com o campo preenchido no cadastro."
            />
            <Step
              number={2}
              title="Seu amigo confirma"
              description={`Ele cria a conta e faz uma das três coisas abaixo. Tem ${REFERRAL_VALIDATION_DAYS} dias para isso.`}
            />
            <Step
              number={3}
              title="Vocês ganham"
              description={`Você recebe ${REFERRAL_REWARD_DIRECT} de Aura na hora. Se ele indicar alguém depois, mais ${REFERRAL_REWARD_INDIRECT}.`}
            />
          </div>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="verificacao">
              <AccordionTrigger>
                O que meu amigo precisa fazer para a indicação valer?
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Só criar a conta não conta. Ele precisa fazer{" "}
                  <strong className="text-foreground">uma</strong> destas três coisas, a que for
                  mais fácil para ele:
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-2">
                    <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      <strong className="text-foreground">Entrar no nosso Discord</strong> e
                      confirmar na Central de Aura (leva menos de um minuto e ainda rende 50 de Aura
                      para ele).
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      <strong className="text-foreground">Conectar a conta do Google ou do
                      Discord</strong> em Conta → Conexões. É o caminho mais rápido.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      <strong className="text-foreground">
                        Fazer {REFERRAL_STREAK_DAYS} dias de ofensiva
                      </strong>
                      : completar as missões diárias por {REFERRAL_STREAK_DAYS} dias seguidos.
                    </span>
                  </li>
                </ul>
                <p>
                  Assim que ele cumprir qualquer uma delas, sua Aura cai na hora. Você acompanha o
                  que falta na lista aqui em cima.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="por-que">
              <AccordionTrigger>Por que tem essa exigência?</AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Para o programa ser justo com quem indica de verdade. Se bastasse criar uma conta,
                  qualquer um poderia gerar dezenas de cadastros falsos com e-mails descartáveis e
                  farmar Aura, e aí a Aura de todo mundo valeria menos.
                </p>
                <p>
                  As três opções acima são coisas que uma pessoa real faz naturalmente e que ninguém
                  consegue repetir de graça em massa. Quem indica amigos de verdade nem percebe a
                  regra; quem tenta fraudar esbarra nela.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="niveis">
              <AccordionTrigger>Como funciona o bônus de {REFERRAL_REWARD_INDIRECT} Aura?</AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Se você indica a Ana, e a Ana indica o Bruno, você ganha{" "}
                  <strong className="text-foreground">{REFERRAL_REWARD_INDIRECT} de Aura</strong>{" "}
                  quando o Bruno confirmar a conta, além dos{" "}
                  {REFERRAL_REWARD_DIRECT} que a Ana ganha por ele.
                </p>
                <p>
                  O bônus vai só até esse segundo nível: se o Bruno indicar mais alguém, esse ganho é
                  dele e de quem o indicou, não seu. É de propósito: mantém o programa como uma
                  recompensa por trazer amigos, e não uma corrente onde quem chegou primeiro lucra
                  com todo mundo abaixo.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="cupom">
              <AccordionTrigger>Link ou cupom: qual usar?</AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Os dois levam ao mesmo lugar. O <strong className="text-foreground">link</strong> é
                  melhor para mandar em conversa: quem clica já chega no cadastro com o cupom
                  preenchido, sem precisar digitar nada.
                </p>
                <p>
                  O <strong className="text-foreground">cupom</strong> serve para quando não dá para
                  clicar (num vídeo, numa live ou numa conversa presencial). A pessoa digita no campo
                  &quot;Cupom de Indicação&quot; ao criar a conta.
                </p>
                <p>
                  O cupom só pode ser usado <strong className="text-foreground">no momento do
                  cadastro</strong>. Quem já tem conta não consegue aplicar depois.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="prazo">
              <AccordionTrigger>Existe prazo ou limite?</AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Seu amigo tem <strong className="text-foreground">{REFERRAL_VALIDATION_DAYS} dias</strong>{" "}
                  depois do cadastro para confirmar a conta. Passou disso, a indicação expira e não
                  gera mais Aura, por isso vale lembrar quem está na lista como
                  &quot;Aguardando&quot;.
                </p>
                <p>
                  O limite é de <strong className="text-foreground">{REFERRAL_MAX_PER_USER} indicações
                  confirmadas</strong> por pessoa. Cada pessoa também só pode ser indicada uma vez,
                  por uma pessoa só; vale quem foi usado no cadastro dela.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="regras">
              <AccordionTrigger>O que não vale</AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Criar contas para si mesmo não funciona: contas com o mesmo CPF ou que sejam
                  claramente da mesma pessoa não geram Aura, e o sistema também não aceita alguém
                  usando o próprio cupom.
                </p>
                <p>
                  Várias indicações vindas da mesma casa ou da mesma rede passam por uma conferência
                  antes de liberar. Se você mora com outras pessoas que se cadastraram de verdade,
                  fica tranquilo: é só uma checagem, e a gente libera. Fale com o suporte se alguma
                  indicação legítima ficar parada.
                </p>
                <p>
                  Tentativas de fraude podem custar a Aura ganha e a participação no programa.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="aura">
              <AccordionTrigger>Onde vejo minha Aura?</AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Tudo cai na sua carteira e aparece no extrato da{" "}
                  <Link href="/aura" className="text-primary hover:underline">
                    Central de Aura
                  </Link>
                  , identificado como indicação.
                </p>
                <p>
                  A Aura de indicação é um valor fixo: {REFERRAL_REWARD_DIRECT} e{" "}
                  {REFERRAL_REWARD_INDIRECT} secos, sem passar pelo multiplicador de Ofensiva ou VIP.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  )
}

function Step({
  number,
  title,
  description,
}: {
  number: number
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-4">
      <Badge variant="outline" className="mb-2 size-6 justify-center rounded-full p-0 text-xs">
        {number}
      </Badge>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
