import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import {
  DEFAULT_ADJUST,
  mediaAdjustStyle,
  type MediaAdjust,
} from "@/lib/profile-media-adjust"
import { buildProfileMediaItems, indexOfMedia } from "@/lib/profile-media-items"
import { cn } from "@/lib/utils"
import { ProfileImageLightbox } from "./ProfileImageLightbox"

interface BannerProps {
  bannerUrl: string | null
  /** Enquadramento escolhido pelo dono no editor de perfil. */
  adjust?: MediaAdjust
  className?: string
  /**
   * Nome do dono — vai para o rótulo acessível da capa no visualizador.
   */
  name?: string
  /**
   * Foto do perfil, só para o visualizador poder oferecer a aba "Foto" ao lado
   * da capa. Não é renderizada aqui (quem desenha o avatar é `AvatarQuadrado`).
   */
  avatarUrl?: string | null
}

/**
 * Capa do perfil. Ocupa a largura total do card e reserva espaço embaixo
 * para a foto sobreposta (ver `AvatarQuadrado`).
 *
 * `bannerUrl` já chega como `profileMediaProxyUrl` (nunca a coluna crua) —
 * quem resolve tier/VIP e decide se o GIF anima ou congela é a rota, com
 * dado fresco do banco (ver `resolveProfileMedia`/`profileMediaProxyUrl` em
 * `lib/account-tier.ts` e `profile-showcase-repository.ts`).
 *
 * A capa não desenha sinal de tier nenhum: a borda roxa que o VIP tinha no
 * rodapé costurava a capa ao corpo do cartão e virava uma faixa atravessando o
 * perfil inteiro. O sinal de tier mora na foto (`AvatarQuadrado`/
 * `ProfileAvatar`), como em todas as outras telas — por isso a capa nem recebe
 * mais `tier`/`vipExpiresAt`.
 */
export function Banner({
  bannerUrl,
  adjust = DEFAULT_ADJUST,
  className,
  name = "",
  avatarUrl = null,
}: BannerProps) {
  const src = bannerUrl

  const image = (
    <div
      className={cn(
        // O gradiente fica sempre no fundo: capa ausente — ou que falhe ao
        // carregar — descobre ele em vez de deixar uma faixa vazia.
        "relative h-32 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-muted/40 to-background sm:h-44 md:h-56",
        className
      )}
    >
      {/* `object-cover` + `object-center` faz a capa preencher os 100% da
          largura em qualquer proporção enviada: o excedente é cortado em vez
          de deixar barra vazia nas laterais. `sizes="100vw"` porque o card
          ocupa a largura toda do container em todos os breakpoints — declarar
          1024px fazia o navegador pedir um arquivo estreito demais em telas
          grandes. */}
      <ImageWithFallback
        src={src}
        alt=""
        fill
        priority
        sizes="100vw"
        style={mediaAdjustStyle(adjust)}
        className="h-full w-full object-cover"
        fallback={null}
      />
      {/* Sem véu escuro sobre a capa: nome, bio e contadores ficam abaixo dela,
          no fundo do card — não há texto aqui para proteger. O degradê que
          existia só apagava o terço de baixo da imagem e, colado ao fundo
          escuro do card logo abaixo, fazia as duas áreas virarem uma tarja
          preta única. */}
    </div>
  )

  // Sem capa enviada não há o que ampliar — o gradiente de fallback não abre modal.
  if (!src) return image

  const { items, kinds } = buildProfileMediaItems({
    bannerUrl,
    avatarUrl,
    name,
  })

  return (
    <ProfileImageLightbox
      items={items}
      index={indexOfMedia(kinds, "banner")}
      triggerClassName="w-full"
    >
      {image}
    </ProfileImageLightbox>
  )
}
