import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { isVipActive, resolveProfileMedia, type AccountTier } from "@/lib/account-tier"
import {
  DEFAULT_ADJUST,
  mediaAdjustStyle,
  type MediaAdjust,
} from "@/lib/profile-media-adjust"
import { cn } from "@/lib/utils"
import { ProfileImageLightbox } from "./ProfileImageLightbox"

interface BannerProps {
  bannerUrl: string | null
  tier: AccountTier
  /** Quando expira o VIP (`null` = sem expiração) — decide a moldura roxa. */
  vipExpiresAt?: string | null
  /** Enquadramento escolhido pelo dono no editor de perfil. */
  adjust?: MediaAdjust
  className?: string
}

/**
 * Capa do perfil. Ocupa a largura total do card e reserva espaço embaixo
 * para a foto sobreposta (ver `AvatarFoto`).
 *
 * O redimensionamento vem do storage (ver `lib/image-loader.ts`). A capa de um
 * VIP com GIF pula esse caminho (`unoptimized`) e chega como foi enviada, sem
 * perder quadros na reamostragem.
 *
 * VIP também ganha a mesma borda/brilho roxo da foto (`AvatarQuadrado`) — as
 * duas molduras formam um conjunto só, em vez da capa ficar sem nenhum sinal
 * de tier enquanto só a foto o exibe.
 */
export function Banner({ bannerUrl, tier, vipExpiresAt = null, adjust = DEFAULT_ADJUST, className }: BannerProps) {
  const { src, animated } = resolveProfileMedia(bannerUrl, tier)
  const isVip = isVipActive(tier, vipExpiresAt)

  const image = (
    <div
      className={cn(
        // O gradiente fica sempre no fundo: capa ausente — ou que falhe ao
        // carregar — descobre ele em vez de deixar uma faixa vazia.
        "relative h-32 w-full overflow-hidden bg-gradient-to-br from-primary/20 via-muted/40 to-background sm:h-44 md:h-56",
        isVip && "border-[3px] border-[var(--vip-accent)] shadow-[0_0_22px_-3px_var(--vip-accent-soft)]",
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
        unoptimized={animated}
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

  return (
    <ProfileImageLightbox src={src} alt="Capa do perfil" unoptimized={animated} triggerClassName="w-full">
      {image}
    </ProfileImageLightbox>
  )
}
