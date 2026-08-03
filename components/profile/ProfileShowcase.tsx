import Link from "next/link"
import { Settings } from "lucide-react"

import { FollowButton } from "@/components/people/FollowButton"
import { AvatarQuadrado } from "./AvatarQuadrado"
import { Banner } from "./Banner"
import { EstatisticasGrid } from "./EstatisticasGrid"
import { FavoritosGrid } from "./FavoritosGrid"
import { InfoBasica } from "./InfoBasica"
import { MedalhasGrid } from "./MedalhasGrid"
import { SetupGrid } from "./SetupGrid"
import { SocialLinks } from "./SocialLinks"
import type { ProfileShowcase as ProfileShowcaseData } from "@/lib/profile-showcase"

/**
 * Altura da capa. Fica isolada aqui porque é o número que estamos calibrando
 * — mexer nela é a única coisa necessária para o header inteiro acompanhar.
 */
const BANNER_HEIGHT = "h-44 sm:h-64 md:h-80"

interface ProfileShowcaseProps {
  profile: ProfileShowcaseData
  /** Habilita atalhos de edição quando é o próprio dono visitando. */
  isOwner?: boolean
  /** Estado inicial do botão "Seguir" para quem está visitando. */
  isFollowing?: boolean
}

/**
 * Vitrine pública do perfil: capa larga, foto quadrada ancorada no canto
 * inferior esquerdo dela, nome e badges ao lado, e então bio, estatísticas,
 * medalhas, setup e favoritos.
 *
 * A foto sai do fluxo (`absolute`) e invade a capa pela metade — é o que
 * elimina a faixa vazia que o layout antigo, de foto circular centralizada,
 * obrigava a existir logo abaixo do banner.
 */
export function ProfileShowcase({
  profile,
  isOwner = false,
  isFollowing = false,
}: ProfileShowcaseProps) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <div className="overflow-hidden rounded-2xl border border-border bg-card/60">
        <div className="relative">
          <Banner
            bannerUrl={profile.banner_url}
            tier={profile.account_tier}
            adjust={profile.media_adjustments.banner}
            className={BANNER_HEIGHT}
          />

          {/* A foto ancora no canto inferior esquerdo e invade a capa pela
              metade. Fora do fluxo (absolute) de propósito: assim o bloco de
              nome ao lado sobe junto com ela, em vez de a página reservar uma
              faixa vazia sob o banner só para caber a foto. */}
          <div className="absolute bottom-0 left-4 translate-y-1/2 sm:left-6">
            <AvatarQuadrado
              avatarUrl={profile.avatar_url}
              name={profile.display_name}
              tier={profile.account_tier}
              adjust={profile.media_adjustments.avatar}
            />
          </div>
        </div>

        {/* Recuo à esquerda = largura da foto + respiro, para o nome começar
            depois dela. No mobile a foto ocupa quase toda a coluna, então o
            texto desce para baixo dela em vez de espremer. */}
        <div className="px-4 pb-5 pt-3 sm:px-6 sm:pl-[9.5rem] sm:pt-4 md:pl-[10.5rem]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="mt-12 sm:mt-0">
              <InfoBasica
                name={profile.display_name}
                tier={profile.account_tier}
                memberSince={profile.member_since}
                displaySlug={profile.display_slug}
                auraRank={profile.aura_rank}
              />
              <SocialLinks
                youtubeHandle={profile.youtube_handle}
                tiktokHandle={profile.tiktok_handle}
                className="mt-2 justify-start"
              />
            </div>

            {isOwner ? (
              <Link
                href="/perfil"
                className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <Settings className="size-3.5" />
                Editar perfil
              </Link>
            ) : (
              <FollowButton
                userId={profile.id}
                initialFollowing={isFollowing}
                size="md"
                className="shrink-0 self-start"
              />
            )}
          </div>
        </div>
      </div>

      {profile.bio && (
        <div className="mt-3 rounded-2xl border border-border bg-card/60 px-4 py-3.5 sm:px-5">
          <p className="text-sm leading-relaxed text-muted-foreground">{profile.bio}</p>
        </div>
      )}

      <EstatisticasGrid
        className="mt-3"
        aura={profile.aura}
        posts={profile.forum_posts}
        comentarios={profile.forum_comments}
        seguidores={profile.followers}
      />

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
