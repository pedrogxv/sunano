import { revalidatePath } from "next/cache"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ShieldAlert, ShieldCheck } from "lucide-react"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { listTrustFlags, resolveTrustFlag } from "@/lib/server/repositories/trust-repository"
import {
  TRUST_FLAG_DESCRIPTION,
  TRUST_FLAG_LABEL,
  TRUST_PHYSICAL_REDEEM_LEVEL,
  trustLevelLabel,
  type TrustFlag,
} from "@/lib/trust-factor"
import { profilePath } from "@/lib/profile-name"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { Button } from "@/components/ui/button"
import { ProfileAvatar } from "@/components/ui/ProfileAvatar"

export const dynamic = "force-dynamic"

/**
 * Fila de flags de segurança do Trust Factor (§9 e §12.9 do documento).
 *
 * Esta tela é a PILHA ABERTA, não o histórico: o trabalho da moderação é
 * resolver o que está levantado. O extrato completo de uma conta fica na
 * própria conta (`/admin/trust/[userId]`), porque é lá que ele é lido — ao
 * julgar um caso específico, não ao varrer a fila.
 *
 * A flag pode ter sido levantada pela DETECÇÃO automática (o cron diário, sem
 * `raised_by`) ou por alguém da equipe. Resolver devolve a conta para `active`
 * só quando não sobra nenhuma outra flag aberta — quem ainda está com fraude
 * em análise não recupera o acesso porque a flag de spam foi arquivada.
 */
async function resolveFlag(formData: FormData) {
  "use server"
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_write")) return

  const flagId = String(formData.get("flagId") ?? "")
  const resolution = String(formData.get("resolution") ?? "").trim() || null
  if (!flagId) return

  await resolveTrustFlag(flagId, { actorId: auth.profile.id, resolution })
  revalidatePath("/admin/trust")
}

export default async function AdminTrustPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>
}) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_read")) {
    redirect("/admin")
  }

  const params = await searchParams
  const showAll = params.all === "1"
  const canWrite = hasAdminPermission(auth.profile, "forum_write")
  const flags = await listTrustFlags({ onlyOpen: !showAll })

  return (
    <div className="space-y-6">
      <BackBreadcrumb href="/admin" parentLabel="Painel" currentLabel="Trust Factor" />

      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-foreground">Trust Factor</h1>
        <p className="text-sm text-muted-foreground">
          Flags de segurança levantadas pela detecção automática ou pela equipe. Uma flag ativa
          bloqueia funções sensíveis — resgate de produto físico, entre elas — mesmo que a
          pontuação da conta esteja alta.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">Como a pontuação funciona</p>
        <ul className="mt-2 space-y-1">
          <li>• Toda conta começa em 50 e o usuário vê apenas a faixa, nunca o número.</li>
          <li>
            • Atividade legítima rende no máximo +3 por dia; penalidade não respeita esse teto.
          </li>
          <li>
            • Teto por idade de conta: 59 nos 7 primeiros dias, 69 até 30, 79 até 90. Depois, sem
            teto.
          </li>
          <li>
            • Penalidade não é apagada: perde peso com o tempo (30 dias para leve, 90 para média,
            180 para grave). Fraude crítica não se recupera sozinha.
          </li>
          <li>
            • Resgate de produto físico exige faixa{" "}
            <strong className="text-foreground">{trustLevelLabel(TRUST_PHYSICAL_REDEEM_LEVEL)}</strong> e
            conta sem restrição.
          </li>
        </ul>
      </div>

      <div className="flex gap-2">
        <Link href="/admin/trust">
          <Button variant={showAll ? "outline" : "default"} size="sm">
            Abertas
          </Button>
        </Link>
        <Link href="/admin/trust?all=1">
          <Button variant={showAll ? "default" : "outline"} size="sm">
            Todas
          </Button>
        </Link>
      </div>

      {flags.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-12 text-center">
          <ShieldCheck className="size-8 text-emerald-400" />
          <p className="text-sm font-semibold text-foreground">Nenhuma flag aberta</p>
          <p className="text-xs text-muted-foreground">
            A detecção automática roda uma vez por dia e levanta flags de farming e spam.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => (
            <div
              key={flag.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start"
            >
              <ProfileAvatar
                name={flag.userName ?? "Usuário"}
                avatarUrl={flag.userAvatarUrl}
                size="md"
              />

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {flag.userSlug ? (
                    <Link
                      href={profilePath(flag.userSlug)}
                      className="font-semibold text-foreground hover:underline"
                    >
                      {flag.userName ?? "Usuário"}
                    </Link>
                  ) : (
                    <span className="font-semibold text-foreground">{flag.userName ?? "Usuário"}</span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-400">
                    <ShieldAlert className="size-2.5" />
                    {TRUST_FLAG_LABEL[flag.flag as TrustFlag]}
                  </span>
                  {flag.resolvedAt && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      Resolvida
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  {TRUST_FLAG_DESCRIPTION[flag.flag as TrustFlag]}
                </p>
                {flag.reason && (
                  <p className="text-xs text-foreground/80">
                    <span className="font-semibold">Motivo:</span> {flag.reason}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground/70">
                  Levantada em {new Date(flag.raisedAt).toLocaleString("pt-BR")}
                  {flag.resolution ? ` · Resolução: ${flag.resolution}` : ""}
                </p>
              </div>

              {canWrite && !flag.resolvedAt && (
                <form action={resolveFlag} className="flex shrink-0 items-center gap-2">
                  <input type="hidden" name="flagId" value={flag.id} />
                  <input
                    name="resolution"
                    placeholder="Resolução (opcional)"
                    className="h-8 w-40 rounded-md border border-border bg-background px-2 text-xs"
                  />
                  <Button type="submit" size="sm" variant="outline">
                    Resolver
                  </Button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
