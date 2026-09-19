import { revalidatePath } from "next/cache"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { hasAdminPermission, isWebMaster } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import {
  applyTrustEvent,
  getTrustEvents,
  getTrustSummary,
  raiseTrustFlag,
  setTrustStatus,
} from "@/lib/server/repositories/trust-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  TRUST_DAILY_GAIN_CAP,
  TRUST_EVENTS,
  TRUST_FLAGS,
  TRUST_FLAG_LABEL,
  TRUST_MANUAL_EVENTS,
  TRUST_RECOVERY_TEXT,
  TRUST_SEVERITY_LABEL,
  TRUST_STATUS_LABEL,
  trustMaturityCap,
  type TrustEventType,
  type TrustFlag,
  type TrustStatus,
} from "@/lib/trust-factor"
import { profilePath } from "@/lib/profile-name"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { Button } from "@/components/ui/button"
import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import { TrustBadge, TrustSeal } from "@/components/ui/TrustBadge"

export const dynamic = "force-dynamic"

/**
 * Ficha de confiança de uma conta: faixa, extrato e as ações manuais.
 *
 * É AQUI que a pontuação exata aparece — e só aqui. A tela pública mostra a
 * faixa; o número, os pesos e a severidade ficam no painel, porque expor o
 * gradiente é entregar a régua para quem quer calibrar farm.
 *
 * As ações manuais (aplicar evento, mudar status, levantar flag) são todas
 * escritas por RPC. Nenhum caminho desta tela escreve `trust_score` direto: a
 * nota é derivada do extrato, e um UPDATE à mão seria apagado pelo recálculo
 * do dia seguinte sem deixar rastro do porquê.
 */

async function applyEvent(formData: FormData) {
  "use server"
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_write")) return

  const userId = String(formData.get("userId") ?? "")
  const type = String(formData.get("eventType") ?? "") as TrustEventType
  const reason = String(formData.get("reason") ?? "").trim() || null
  const rawPoints = String(formData.get("points") ?? "").trim()

  if (!userId || !TRUST_EVENTS[type]) return

  // `points` só é respeitado quando o evento tem FAIXA no documento (ex.:
  // fraude -20 a -40) ou é o ajuste manual. Para os demais, o peso é o do
  // catálogo — senão a mesma infração valeria coisas diferentes conforme quem
  // clicou.
  const definition = TRUST_EVENTS[type]
  const allowsCustom = Boolean(definition.range) || type === "admin_adjustment"
  const parsed = Number.parseInt(rawPoints, 10)
  const points =
    allowsCustom && Number.isFinite(parsed) && parsed !== 0 ? parsed : definition.points

  await applyTrustEvent({
    userId,
    type,
    points,
    reason,
    actorId: auth.profile.id,
  })

  revalidatePath(`/admin/trust/${userId}`)
}

async function changeStatus(formData: FormData) {
  "use server"
  const auth = await getAuthorizedProfile()
  // Bloquear/desbloquear conta é decisão terminal (zera o Trust e trava o
  // resgate): só WEB MASTER, mesma régua de outras ações destrutivas.
  if (!auth.profile || !isWebMaster(auth.profile)) return

  const userId = String(formData.get("userId") ?? "")
  const status = String(formData.get("status") ?? "") as TrustStatus
  const reason = String(formData.get("statusReason") ?? "").trim() || null

  if (!userId || !["active", "watch", "restricted", "blocked"].includes(status)) return

  await setTrustStatus(userId, status, { reason, actorId: auth.profile.id })
  revalidatePath(`/admin/trust/${userId}`)
}

async function addFlag(formData: FormData) {
  "use server"
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_write")) return

  const userId = String(formData.get("userId") ?? "")
  const flag = String(formData.get("flag") ?? "") as TrustFlag
  const reason = String(formData.get("flagReason") ?? "").trim() || null

  if (!userId || !TRUST_FLAGS.includes(flag)) return

  await raiseTrustFlag(userId, flag, { reason, actorId: auth.profile.id })
  revalidatePath(`/admin/trust/${userId}`)
}

export default async function AdminTrustUserPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_read")) {
    redirect("/admin")
  }

  const { userId } = await params
  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from("user_profiles")
    .select("id, display_name, display_slug, avatar_url, created_at")
    .eq("id", userId)
    .maybeSingle()

  if (!profile) notFound()

  const [trust, events] = await Promise.all([
    getTrustSummary(userId),
    getTrustEvents(userId, { limit: 100 }),
  ])

  const canWrite = hasAdminPermission(auth.profile, "forum_write")
  const canChangeStatus = isWebMaster(auth.profile)
  const cap = trustMaturityCap(profile.created_at)

  return (
    <div className="space-y-6">
      <BackBreadcrumb
        href="/admin/trust"
        parentLabel="Trust Factor"
        currentLabel={profile.display_name ?? "Conta"}
      />

      {/* Cabeçalho — a nota exata aparece SÓ aqui, no painel. */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center">
        <ProfileAvatar
          name={profile.display_name ?? "Usuário"}
          avatarUrl={profile.avatar_url}
          size="lg"
        />
        <TrustSeal level={trust.level} status={trust.status} size="md" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {profile.display_slug ? (
              <Link
                href={profilePath(profile.display_slug)}
                className="font-display text-lg font-bold text-foreground hover:underline"
              >
                {profile.display_name ?? "Usuário"}
              </Link>
            ) : (
              <span className="font-display text-lg font-bold text-foreground">
                {profile.display_name ?? "Usuário"}
              </span>
            )}
            <TrustBadge level={trust.level} status={trust.status} score={trust.score} showScore />
          </div>
          <p className="text-xs text-muted-foreground">
            Estado: {TRUST_STATUS_LABEL[trust.status]} · Teto por maturidade: {cap}
            {cap < 100 ? " (conta ainda nova)" : ""} · Ganho positivo limitado a{" "}
            {TRUST_DAILY_GAIN_CAP}/dia
          </p>
          <p className="text-xs text-muted-foreground">
            Resgate de produto físico:{" "}
            {trust.canRedeemPhysical ? (
              <span className="font-semibold text-emerald-400">liberado</span>
            ) : (
              <span className="font-semibold text-amber-400">bloqueado</span>
            )}{" "}
            · Sunano Tester: <span className="font-semibold">{TESTER_LABEL[trust.tester]}</span>
          </p>
          {trust.flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {trust.flags.map((flag) => (
                <span
                  key={flag}
                  className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-400"
                >
                  {TRUST_FLAG_LABEL[flag]}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {canWrite && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Aplicar evento */}
          <form
            action={applyEvent}
            className="space-y-2 rounded-xl border border-border bg-card p-4 lg:col-span-1"
          >
            <input type="hidden" name="userId" value={userId} />
            <p className="text-sm font-semibold text-foreground">Aplicar evento</p>
            <select
              name="eventType"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
              defaultValue="warning"
            >
              {TRUST_MANUAL_EVENTS.map((type) => {
                const def = TRUST_EVENTS[type]
                return (
                  <option key={type} value={type}>
                    {def.label} ({def.range ? `${def.range[0]} a ${def.range[1]}` : def.points})
                  </option>
                )
              })}
            </select>
            <input
              name="points"
              type="number"
              placeholder="Pontos (só para eventos com faixa)"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
            />
            <input
              name="reason"
              placeholder="Motivo (aparece no extrato)"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
            />
            <Button type="submit" size="sm" className="w-full">
              Registrar evento
            </Button>
          </form>

          {/* Levantar flag */}
          <form
            action={addFlag}
            className="space-y-2 rounded-xl border border-border bg-card p-4 lg:col-span-1"
          >
            <input type="hidden" name="userId" value={userId} />
            <p className="text-sm font-semibold text-foreground">Levantar flag</p>
            <p className="text-[10px] text-muted-foreground">
              Bloqueia funções sensíveis mesmo com pontuação alta.
            </p>
            <select
              name="flag"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
              defaultValue="SPAM"
            >
              {TRUST_FLAGS.map((flag) => (
                <option key={flag} value={flag}>
                  {TRUST_FLAG_LABEL[flag]}
                </option>
              ))}
            </select>
            <input
              name="flagReason"
              placeholder="Motivo"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
            />
            <Button type="submit" size="sm" variant="outline" className="w-full">
              Levantar
            </Button>
          </form>

          {/* Estado da conta — só WEB MASTER */}
          {canChangeStatus && (
            <form
              action={changeStatus}
              className="space-y-2 rounded-xl border border-border bg-card p-4 lg:col-span-1"
            >
              <input type="hidden" name="userId" value={userId} />
              <p className="text-sm font-semibold text-foreground">Estado da conta</p>
              <p className="text-[10px] text-muted-foreground">
                &quot;Bloqueada&quot; zera o Trust e não se recupera sozinha.
              </p>
              <select
                name="status"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                defaultValue={trust.status}
              >
                {(["active", "watch", "restricted", "blocked"] as TrustStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {TRUST_STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
              <input
                name="statusReason"
                placeholder="Motivo"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
              />
              <Button type="submit" size="sm" variant="outline" className="w-full">
                Alterar estado
              </Button>
            </form>
          )}
        </div>
      )}

      {/* Extrato */}
      <div className="space-y-2">
        <h2 className="font-display text-lg font-bold text-foreground">Extrato de confiança</h2>
        {events.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum evento ainda. A conta está na pontuação inicial.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Evento</th>
                  <th className="px-3 py-2">Impacto</th>
                  <th className="px-3 py-2">Severidade</th>
                  <th className="px-3 py-2">Origem</th>
                  <th className="px-3 py-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="font-semibold text-foreground">
                        {TRUST_EVENTS[event.eventType as TrustEventType]?.label ?? event.eventType}
                      </span>
                      {event.reason && (
                        <span className="block text-[10px] text-muted-foreground">
                          {event.reason}
                        </span>
                      )}
                      {event.actorName && (
                        <span className="block text-[10px] text-muted-foreground/70">
                          por {event.actorName}
                        </span>
                      )}
                    </td>
                    <td
                      className={
                        event.points > 0
                          ? "px-3 py-2 font-mono font-semibold text-emerald-400"
                          : event.points < 0
                            ? "px-3 py-2 font-mono font-semibold text-red-400"
                            : "px-3 py-2 font-mono text-muted-foreground"
                      }
                    >
                      {event.points > 0 ? `+${event.points}` : event.points}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <span className="font-medium">{TRUST_SEVERITY_LABEL[event.severity]}</span>
                      <span className="block text-[10px] text-muted-foreground/70">
                        {TRUST_RECOVERY_TEXT[event.severity]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{event.source}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const TESTER_LABEL = {
  eligible: "elegível",
  not_selectable: "não selecionável",
  suspended: "suspenso para análise",
  blocked: "bloqueado",
} as const
