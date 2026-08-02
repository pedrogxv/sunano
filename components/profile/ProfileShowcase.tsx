import Link from "next/link"
import { Settings, Users } from "lucide-react"

import { FollowButton } from "@/components/people/FollowButton"
import { AvatarFoto } from "./AvatarFoto"
import { Banner } from "./Banner"
import { FavoritosGrid } from "./FavoritosGrid"
import { InfoBasica } from "./InfoBasica"
import { MedalhasGrid } from "./MedalhasGrid"
import { SetupGrid } from "./SetupGrid"
import { SocialLinks } from "./SocialLinks"
import type { ProfileShowcase as ProfileShowcaseData } from "@/lib/profile-showcase"

interface ProfileShowcaseProps {
  profile: ProfileShowcaseData
  /** Habilita atalhos de edição quando é o próprio dono visitando. */
  isOwner?: boolean
  /** Estado inicial do botão "Seguir" para quem está visitando. */
  isFollowing?: boolean
}

/**
 * Vitrine pública do perfil, na ordem do wireframe:
 * banner → foto → nome/bio → medalhas → setup → favoritos.
 */
export function ProfileShowcase({
  profile,
  isOwner = false,
  isFollowing = false,
}: ProfileShowcaseProps) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <div className="overflow-hidden rounded-2xl border border-border bg-card/60">
        <Banner bannerUrl={profile.banner_url} tier={profile.account_tier} />

        {/* Avatar sobreposto: metade dentro, metade fora do banner. */}
        <div className="flex flex-col items-center px-4 pb-6">
          {/* Só a foto. O fundo do mini perfil (`mini_banner_url`) é outra
              feature: ele pertence ao cartão de preview rápido
              (`MiniProfileCard`) e não deve vazar para o perfil completo, que
              já tem a capa grande logo acima. */}
          <div className="relative -mt-12 sm:-mt-14 md:-mt-16">
            <AvatarFoto
              avatarUrl={profile.avatar_url}
              name={profile.display_name}
              tier={profile.account_tier}
            />
          </div>

          <div className="mt-3 w-full">
            <InfoBasica
              name={profile.display_name}
              bio={profile.bio}
              tier={profile.account_tier}
              memberSince={profile.member_since}
              displaySlug={profile.display_slug}
            />
          </div>

          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="size-3.5" />
            <span className="font-semibold text-foreground">{profile.followers}</span>
            {profile.followers === 1 ? "seguidor" : "seguidores"}
          </p>

          <SocialLinks youtubeHandle={profile.youtube_handle} tiktokHandle={profile.tiktok_handle} />

          {isOwner ? (
            <Link
              href="/perfil"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <Settings className="size-3.5" />
              Editar perfil
            </Link>
          ) : (
            <FollowButton
              userId={profile.id}
              initialFollowing={isFollowing}
              size="md"
              className="mt-4"
            />
          )}
        </div>
      </div>

      <div className="mt-6 space-y-8">
        <MedalhasGrid
          medals={profile.medals}
          total={profile.medals_total}
          tier={profile.account_tier}
          isOwner={isOwner}
        />

        <SetupGrid setup={profile.setup} isOwner={isOwner} />

        <FavoritosGrid
          favorites={profile.favorites}
          tier={profile.account_tier}
          isOwner={isOwner}
        />
      </div>
    </div>
  )
}
