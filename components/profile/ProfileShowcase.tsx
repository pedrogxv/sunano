import Link from "next/link"
import { Eye, Settings, Trophy } from "lucide-react"

import { FollowButton } from "@/components/people/FollowButton"
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
import { isYoutubeSubscriptionEnabled } from "@/lib/youtube-subscription"
import { isDiscordMembershipEnabled } from "@/lib/discord-membership"

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
 * Vitrine pública do perfil. A identidade — capa, foto, nome, badges, bio,
 * links sociais e estatísticas — vive num **cartão único**: a capa é o topo
 * dele e o resto desce dentro, em vez de a capa flutuar sozinha com o texto
 * solto no fundo da página. A foto quadrada, centralizada, invade a capa pela
 * metade e costura as duas metades do cartão.
 *
 * Abaixo do cartão vêm as seções de conteúdo (conquistas, setup, favoritos,
 * tierlist, reviews) — separadas de propósito: o cartão diz *quem* é a
 * pessoa, as seções dizem *o que* ela tem.
 *
 * Medalhas e botão de ação (Seguir/Editar) ficam ancorados nos cantos da
 * faixa logo abaixo da capa, só a partir de `sm` — largura de sobra ali. No
 * celular eles voltam para o fluxo normal, empilhados abaixo do bloco
 * central: `absolute` nos dois lados brigava com o nome centralizado e
 * estourava a largura da tela em nomes/badges maiores.
 */
export function ProfileShowcase({
  profile,
  isOwner = false,
  isFollowing = false,
}: ProfileShowcaseProps) {
  const actionButton = isOwner ? (
    <div className="flex shrink-0 items-center gap-2">
      <Link
        href="/perfil"
        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <Settings className="size-3.5" />
        Editar perfil
      </Link>
      {/* O editor da tierlist pessoal (VIP) mora na aba "Minha Tierlist" de
          /tierlist agora — não mais embutido no perfil. */}
      <Link
        href="/tierlist/pessoal"
        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <Trophy className="size-3.5" />
        Minha tierlist
      </Link>
    </div>
  ) : (
    <div className="flex shrink-0 items-center gap-2">
      {/* Sem isto a tierlist de outro membro só era alcançável por link
          recebido: o card resumido saiu do perfil e o botão acima é do dono.
          Só aparece quando há o que ver — mandar o visitante pra um board
          vazio é pior do que não oferecer o caminho. */}
      {profile.tierlist_item_count > 0 && (
        <Link
          href={`${profilePath(profile.display_slug ?? profile.id)}/tierlist`}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <Trophy className="size-3.5" />
          Ver tierlist
        </Link>
      )}
      <FollowButton
        userId={profile.id}
        initialFollowing={isFollowing}
        size="md"
        className="shrink-0"
      />
    </div>
  )

  const medals = <MedalhasGrid medals={profile.medals} />
  const medalsCentered = (
    <MedalhasGrid medals={profile.medals} className="justify-center text-center" />
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      {/* Capa e identidade num cartão só. Antes eram dois blocos soltos — capa
          com cantos próprios e, abaixo, texto no fundo da página — e a faixa
          entre eles ficava visualmente órfã. Agora a capa é o topo do cartão e
          nome/badges/stats moram dentro dele, como num perfil de rede social. */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="relative">
          <Banner
            bannerUrl={profile.banner_url}
            tier={profile.account_tier}
            vipExpiresAt={profile.vip_expires_at}
            adjust={profile.media_adjustments.banner}
            className={BANNER_HEIGHT}
            name={profile.display_name}
            avatarUrl={profile.avatar_url}
          />

          {/* Véu na base da capa: a foto e as medalhas encostam nela, e sem
              esse degradê uma capa clara apagava a moldura das duas. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card via-card/50 to-transparent"
            aria-hidden
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
          <div className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2 translate-y-1/2">
            <AvatarQuadrado
              avatarUrl={profile.avatar_url}
              name={profile.display_name}
              tier={profile.account_tier}
              vipExpiresAt={profile.vip_expires_at}
              adjust={profile.media_adjustments.avatar}
              frameUrl={profile.equipped_avatar_frame_url}
              bannerUrl={profile.banner_url}
            />
          </div>

          {/* Medalhas e ação ancoradas nos cantos, agora *dentro* do cartão e
              na faixa logo abaixo da capa — só a partir de `sm`, onde há
              largura de sobra nas laterais do bloco central. */}
          <div className="absolute left-4 top-full mt-3 hidden sm:block">{medals}</div>
          <div className="absolute right-4 top-full mt-3 hidden sm:block">{actionButton}</div>
        </div>

        {/* Espaço reservado abaixo da capa = metade da foto que invade por cima
            dela, para o texto centralizado não colidir com a moldura. */}
        <div className="flex flex-col items-center px-4 pb-6 pt-16 text-center sm:pt-[4.5rem]">
          <InfoBasica
            name={profile.display_name}
            tier={profile.account_tier}
            vipExpiresAt={profile.vip_expires_at}
            memberSince={profile.member_since}
            displaySlug={profile.display_slug}
            auraRank={profile.aura_rank}
            activityRank={profile.activity_rank}
            streak={profile.streak.current}
            streakFrozen={profile.streak.frozen}
            streakFrozenUntil={profile.streak.frozenUntil}
            bio={profile.bio}
            isOwner={isOwner}
          />
          <SocialLinks
            youtubeHandle={profile.youtube_handle}
            tiktokHandle={profile.tiktok_handle}
            className="mt-3 justify-center"
          />

          {/* Versão de fluxo normal do botão de ação + medalhas, só até `sm`
              (a versão ancorada nos cantos da capa assume dali pra cima). */}
          <div className="mt-4 flex w-full flex-col items-center gap-3 sm:hidden">
            {actionButton}
            {medalsCentered}
          </div>

          {/* Stats entram no mesmo cartão, separadas por um filete: são parte
              da identidade ("quem é essa pessoa aqui dentro"), não uma seção
              de conteúdo como setup/favoritos. */}
          <div className="mt-6 w-full border-t border-border/60 pt-5">
            <EstatisticasGrid
              userId={profile.id}
              aura={profile.aura}
              posts={profile.forum_posts}
              comentarios={profile.forum_comments}
              seguidores={profile.followers}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-8">
        <AchievementsGrid
          achievements={profile.achievements}
          counts={{
            posts: profile.forum_posts,
            comments: profile.forum_comments,
            followers: profile.followers,
            aura_earned: profile.aura_total_earned,
          }}
          youtubeSubscribed={isYoutubeSubscriptionEnabled() ? profile.youtube_subscribed : undefined}
          discordMember={isDiscordMembershipEnabled() ? profile.discord_member : undefined}
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
