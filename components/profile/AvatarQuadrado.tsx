import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { resolveProfileMedia, type AccountTier } from "@/lib/account-tier"
import {
  DEFAULT_ADJUST,
  mediaAdjustStyle,
  type MediaAdjust,
} from "@/lib/profile-media-adjust"
import { cn } from "@/lib/utils"

interface AvatarQuadradoProps {
  avatarUrl: string | null
  name: string
  tier: AccountTier
  /** Enquadramento escolhido pelo dono no editor de perfil. */
  adjust?: MediaAdjust
  className?: string
}

/**
 * Cor da moldura por tier. VIP+ recebe o dourado da referência; VIP fica no
 * âmbar do próprio badge e conta comum numa borda neutra, para a moldura
 * continuar sendo um sinal de tier e não decoração de todo mundo.
 */
const TIER_FRAME: Record<AccountTier, string> = {
  common: "border-border",
  vip: "border-amber-400/70",
  vip_plus: "border-amber-300",
}

/** Brilho externo — só para quem tem tier, senão vira ruído na grade. */
const TIER_GLOW: Record<AccountTier, string> = {
  common: "",
  vip: "shadow-[0_0_18px_-4px_rgba(251,191,36,0.55)]",
  vip_plus: "shadow-[0_0_22px_-3px_rgba(252,211,77,0.75)]",
}

/**
 * Foto de perfil quadrada com cantos arredondados, ancorada no canto inferior
 * esquerdo do banner (ver `ProfileShowcase`).
 *
 * Substitui o círculo centralizado: com a foto no canto, o nome ocupa a faixa
 * ao lado dela em vez de descer para baixo do banner, e some a tira vazia que
 * o layout centralizado obrigava a existir sob a capa.
 *
 * A regra de mídia animada é a mesma do resto do perfil — GIF de VIP passa
 * direto (`unoptimized`), sem perder quadros na reamostragem do storage.
 */
export function AvatarQuadrado({
  avatarUrl,
  name,
  tier,
  adjust = DEFAULT_ADJUST,
  className,
}: AvatarQuadradoProps) {
  const { src, animated } = resolveProfileMedia(avatarUrl, tier)
  const initials = name.trim().split(/\s+/).map((part) => part[0]).join("").toUpperCase().slice(0, 2)

  return (
    <div
      className={cn(
        "relative size-24 shrink-0 overflow-hidden rounded-xl border-[3px] bg-muted sm:size-28 md:size-32",
        TIER_FRAME[tier],
        TIER_GLOW[tier],
        className
      )}
    >
      <ImageWithFallback
        src={src}
        alt={name}
        fill
        priority
        unoptimized={animated}
        sizes="128px"
        style={mediaAdjustStyle(adjust)}
        className="object-cover"
        fallback={
          <div className="flex size-full items-center justify-center bg-primary/15 text-2xl font-bold text-primary">
            {initials || "?"}
          </div>
        }
      />
    </div>
  )
}
