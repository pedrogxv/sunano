import Link from "next/link"
import { ExternalLink } from "lucide-react"

import type { ProfileData } from "./ProfileSection"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getTierCapabilities, coerceAccountTier } from "@/lib/account-tier"
import { profilePath } from "@/lib/profile-name"
import { getSpecialTag } from "@/lib/special-tag"

/**
 * Cabeçalho compartilhado por /perfil e /conta — quem é você, com atalho
 * para o perfil público.
 */
export function AccountPageHeader({ profile }: { profile: ProfileData }) {
  const name = profile.display_name?.trim() || (profile.email?.split("@")[0] ?? "Usuário")
  const tierLabel = getTierCapabilities(coerceAccountTier(profile.account_tier)).label
  const specialTag = getSpecialTag(profile.display_slug)
  // O endereço público é o slug do nome; o UUID fica de reserva para perfis
  // ainda sem slug (antes da migration rodar).
  const publicProfileHref = profile.display_slug
    ? profilePath(profile.display_slug)
    : profile.id
      ? `/perfil/${profile.id}`
      : null

  return (
    <header className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-4 pt-8 md:px-6">
      <Avatar className="size-14 border border-border">
        <AvatarImage src={profile.avatar_url ?? undefined} alt={name} />
        <AvatarFallback className="text-lg font-bold">
          {name.slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-xl font-bold tracking-tight text-foreground">{name}</h1>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {tierLabel}
          </span>
          {specialTag && (
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${specialTag.className}`}
            >
              {specialTag.label}
            </span>
          )}
        </div>
        <p className="truncate text-sm text-muted-foreground">{profile.email ?? "-"}</p>
      </div>

      {publicProfileHref && (
        <Link
          href={publicProfileHref}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <ExternalLink className="size-3.5" />
          Ver perfil público
        </Link>
      )}
    </header>
  )
}
