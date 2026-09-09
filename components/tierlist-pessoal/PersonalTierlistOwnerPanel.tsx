import Link from "next/link"
import { Crown, LogIn } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { absoluteUrl } from "@/lib/site-url"
import { sortTiers } from "@/lib/personal-tierlist-theme"
import { ShareMenu } from "@/components/forum/ShareMenu"
import { profilePath } from "@/lib/profile-name"
import {
  getUserTierlistItems,
  getUserTierlistMeta,
  getUserTierlistTiers,
  ensureUserTierlistTiers,
} from "@/lib/server/repositories/user-tierlist-repository"
import { getProfileShowcase } from "@/lib/server/repositories/profile-showcase-repository"
import { isVipActive } from "@/lib/account-tier"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { PersonalTierlistEditor } from "@/components/tierlist-pessoal/PersonalTierlistEditor"
import { PersonalTierlistPublicView } from "@/components/tierlist-pessoal/PersonalTierlistPublicView"
import { TierlistNoteCard } from "@/components/tierlist-pessoal/TierlistNoteCard"
import { TierlistVipGate } from "@/components/tierlist-pessoal/TierlistVipGate"
import { TierlistHeartCount } from "@/components/tierlist-pessoal/TierlistHeartButton"
import { PersonalTierlistExportButton } from "@/components/tierlist-pessoal/PersonalTierlistExportButton"

/**
 * Painel "Minha Tierlist" — sempre o dono, nunca um visitante (view pública
 * de outra pessoa continua em `/perfil/[handle]/tierlist`, que redireciona
 * pra cá quando é o próprio dono acessando). Extraído do que antes era o
 * branch `isOwner` de `app/perfil/[handle]/tierlist/page.tsx`, pra viver
 * como a aba "Minha Tierlist" de `/tierlist`.
 */
export async function PersonalTierlistOwnerPanel() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    return (
      <div className={cn("flex flex-col items-center gap-3 rounded-xl border p-8 text-center", CARD_SURFACE)}>
        <LogIn className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Entre na sua conta pra montar sua tierlist pessoal.</p>
        <Link
          href="/login"
          className="rounded-lg px-4 py-2 text-xs font-bold text-black transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--vip-accent)" }}
        >
          Entrar
        </Link>
      </div>
    )
  }

  const profile = await getProfileShowcase(authData.user.id)
  if (!profile) return null

  const ownerIsVip = isVipActive(profile.account_tier, profile.vip_expires_at)

  const [items, meta, tiers] = await Promise.all([
    getUserTierlistItems(profile.id),
    getUserTierlistMeta(profile.id, profile.id),
    // Só cria o preset padrão pra quem pode de fato editar (VIP ativo) — pra
    // quem nunca foi VIP, `getUserTierlistTiers` volta vazio e o gate cobre.
    ownerIsVip ? ensureUserTierlistTiers(profile.id) : getUserTierlistTiers(profile.id),
  ])

  const orderedTiers = sortTiers(tiers)
  const profileHref = profilePath(profile.display_slug ?? profile.id)
  const canonicalPath = `${profileHref}/tierlist`

  return (
    <div className="space-y-4">
      <header className={cn("relative overflow-hidden rounded-xl border p-5", CARD_SURFACE)}>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex h-1">
          {orderedTiers.map((tier) => (
            <div key={tier.id} className="flex-1" style={{ backgroundColor: tier.color }} />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--vip-accent)" }}>
              <Crown className="size-3" />
              Minha tierlist · Beta
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {items.length === 0
                ? "Nenhum periférico classificado ainda."
                : `${items.length} ${items.length === 1 ? "periférico" : "periféricos"} · ${orderedTiers.length} ${orderedTiers.length === 1 ? "tier" : "tiers"}`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {items.length > 0 && <TierlistHeartCount count={meta.heartsCount} />}
            {items.length > 0 && (
              <>
                <PersonalTierlistExportButton
                  ownerName={profile.display_name}
                  tiers={orderedTiers}
                  items={items}
                />
                <ShareMenu
                  url={absoluteUrl(canonicalPath)}
                  title={`Tierlist de ${profile.display_name} na Sunano`}
                  showEmbed={false}
                />
              </>
            )}
          </div>
        </div>
      </header>

      {!ownerIsVip && <TierlistVipGate variant={items.length > 0 ? "expired" : "locked"} />}

      {/* Recado do dono: mostra se já existe (mesmo com VIP expirado) ou se
          o dono pode escrever um agora — mesma regra de antes. */}
      {(meta.note || ownerIsVip) && <TierlistNoteCard note={meta.note} canEdit={ownerIsVip} />}

      {ownerIsVip ? (
        <PersonalTierlistEditor initialItems={items} initialTiers={orderedTiers} />
      ) : items.length > 0 ? (
        <PersonalTierlistPublicView tiers={orderedTiers} items={items} />
      ) : null}
    </div>
  )
}
