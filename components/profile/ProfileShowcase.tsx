import Link from "next/link"
import { Eye, Settings } from "lucide-react"

import { FollowButton } from "@/components/people/FollowButton"
import { cn } from "@/lib/utils"
import { AvatarQuadrado } from "./AvatarQuadrado"
import { AchievementsGrid } from "./AchievementsGrid"
import { Banner } from "./Banner"
import { EstatisticasGrid, formatCount } from "./EstatisticasGrid"
import { FavoritosGrid } from "./FavoritosGrid"
import { InfoBasica } from "./InfoBasica"
import { MedalhasGrid } from "./MedalhasGrid"
import { MeusReviewsGrid } from "./MeusReviewsGrid"
import { SetupGrid } from "./SetupGrid"
import { SocialLinks } from "./SocialLinks"
import { profilePath } from "@/lib/profile-name"
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
 * Vitrine pública do perfil: capa larga com cantos próprios arredondados
 * (sem card envolvendo tudo), foto quadrada centralizada invadindo a capa
 * pela metade, e nome, badges e data centralizados logo abaixo dela.
 *
 * Medalhas e botão de ação (Seguir/Editar) ficam ancorados nos cantos,
 * fora do retângulo da capa, só a partir de `sm` — largura de sobra ali.
 * No celular eles voltam para o fluxo normal, empilhados abaixo do bloco
 * central: `absolute` nos dois lados brigava com o nome centralizado e
 * estourava a largura da tela em nomes/badges maiores.
 */
export function ProfileShowcase({
  profile,
  isOwner = false,
  isFollowing = false,
}: ProfileShowcaseProps) {
  const actionButton = isOwner ? (
    <Link
      href="/perfil"
      className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      <Settings className="size-3.5" />
      Editar perfil
    </Link>
  ) : (
    <FollowButton
      userId={profile.id}
      initialFollowing={isFollowing}
      size="md"
      className="shrink-0"
    />
  )

  const medals = <MedalhasGrid medals={profile.medals} />
  const medalsCentered = (
    <MedalhasGrid medals={profile.medals} className="justify-center text-center" />
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <div className="relative">
        <Banner
          bannerUrl={profile.banner_url}
          tier={profile.account_tier}
          adjust={profile.media_adjustments.banner}
          className={cn("rounded-2xl", BANNER_HEIGHT)}
        />

        {/* Contador de visitas — canto superior direito da capa, sem competir com o botão Seguir/Editar (que fica abaixo dela). */}
        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
          <Eye className="size-3.5" />
          {formatCount(profile.profile_views)}
        </div>

        {/* A foto fica centralizada no eixo horizontal e invade a capa pela
            metade (fora do fluxo, absolute). Centralizar em vez de ancorar
            num canto é o que permite o bloco de nome/badges também ficar
            centralizado abaixo dela, como um cartão de perfil em vez de um
            header alinhado à esquerda. */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
          <AvatarQuadrado
            avatarUrl={profile.avatar_url}
            name={profile.display_name}
            tier={profile.account_tier}
            adjust={profile.media_adjustments.avatar}
          />
        </div>

        {/* Ancorado à esquerda, na mesma linha do botão Seguir/Editar — só a
            partir de `sm`, onde há largura de sobra nas laterais do bloco
            central para não colidir com ele. */}
        <div className="absolute left-0 top-full mt-3 hidden sm:block">{medals}</div>

        {/* Ancorado à direita, na mesma altura do nome (metade da foto abaixo
            da capa) — fora do retângulo da capa, como na referência, em vez
            de flutuar por cima da imagem. Também só a partir de `sm`. */}
        <div className="absolute right-0 top-full mt-3 hidden sm:block">{actionButton}</div>
      </div>

      {/* Espaço reservado abaixo da capa = metade da foto que invade por cima
          dela, para o texto centralizado não colidir com a moldura. */}
      <div className="flex flex-col items-center px-4 pb-5 pt-16 text-center sm:pt-[4.5rem]">
        <InfoBasica
          name={profile.display_name}
          tier={profile.account_tier}
          memberSince={profile.member_since}
          displaySlug={profile.display_slug}
          auraRank={profile.aura_rank}
          activityRank={profile.activity_rank}
          streak={profile.streak.current}
          bio={profile.bio}
        />
        <SocialLinks
          youtubeHandle={profile.youtube_handle}
          tiktokHandle={profile.tiktok_handle}
          className="mt-2 justify-center"
        />

        {/* Versão de fluxo normal do botão de ação + medalhas, só até `sm`
            (a versão ancorada nos cantos da capa assume dali pra cima). */}
        <div className="mt-3 flex w-full flex-col items-center gap-3 sm:hidden">
          {actionButton}
          {medalsCentered}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <EstatisticasGrid
          userId={profile.id}
          aura={profile.aura}
          posts={profile.forum_posts}
          comentarios={profile.forum_comments}
          seguidores={profile.followers}
        />
      </div>

      <div className="mt-3 space-y-8">
        <AchievementsGrid
          achievements={profile.achievements}
          counts={{ posts: profile.forum_posts, comments: profile.forum_comments, followers: profile.followers }}
        />

        <SetupGrid setup={profile.setup} isOwner={isOwner} />

        <FavoritosGrid
          favorites={profile.favorites}
          tier={profile.account_tier}
          isOwner={isOwner}
        />

        <MeusReviewsGrid
          reviewsByCategory={profile.reviewsByCategory}
          reviewsIntegrityAcceptedAt={profile.reviews_integrity_accepted_at}
          reviewedPeripheralIds={profile.reviewed_peripheral_ids}
          isOwner={isOwner}
          reviewsPageHref={`${profilePath(profile.display_slug ?? profile.id)}/reviews`}
        />
      </div>
    </div>
  )
}
