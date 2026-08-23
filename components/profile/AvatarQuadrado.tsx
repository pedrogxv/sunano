import { Crown } from "lucide-react"

import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { isVipActive, resolveProfileMedia, type AccountTier } from "@/lib/account-tier"
import {
  DEFAULT_ADJUST,
  mediaAdjustStyle,
  type MediaAdjust,
} from "@/lib/profile-media-adjust"
import { cn } from "@/lib/utils"
import { ProfileImageLightbox } from "./ProfileImageLightbox"

interface AvatarQuadradoProps {
  avatarUrl: string | null
  name: string
  tier: AccountTier
  /** Quando expira o VIP (`null` = sem expiração) — decide o selo de coroa. */
  vipExpiresAt?: string | null
  /** Enquadramento escolhido pelo dono no editor de perfil. */
  adjust?: MediaAdjust
  className?: string
  /** Moldura cosmética equipada (Central de Aura), sobreposta à foto — `null`/ausente = nenhuma. */
  frameUrl?: string | null
}

/**
 * Cor da moldura por tier. VIP recebe o dourado da referência; conta comum
 * fica numa borda neutra, para a moldura continuar sendo um sinal de tier e
 * não decoração de todo mundo.
 */
const TIER_FRAME: Record<AccountTier, string> = {
  common: "border-border",
  vip: "border-[var(--vip-accent)]",
}

/** Brilho externo — só para quem tem tier, senão vira ruído na grade. */
const TIER_GLOW: Record<AccountTier, string> = {
  common: "",
  vip: "shadow-[0_0_22px_-3px_var(--vip-accent-soft)]",
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
  vipExpiresAt = null,
  adjust = DEFAULT_ADJUST,
  className,
  frameUrl,
}: AvatarQuadradoProps) {
  const { src, animated } = resolveProfileMedia(avatarUrl, tier)
  const initials = name.trim().split(/\s+/).map((part) => part[0]).join("").toUpperCase().slice(0, 2)
  const isVip = isVipActive(tier, vipExpiresAt)

  const frame = (
    <div className="relative shrink-0">
      <div
        className={cn(
          "relative size-24 overflow-hidden rounded-xl border-[3px] bg-muted sm:size-28 md:size-32",
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
        {/* Moldura cosmética da Central de Aura — camada por cima da foto,
            fora do `overflow-hidden` do próprio elemento (ela costuma extrapolar
            levemente a borda de propósito, como um efeito de moldura). */}
        {frameUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frameUrl}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 size-full scale-110 object-contain"
          />
        )}
      </div>

      {/* Selo VIP — mesma técnica do PersonAvatar, ancorado na base da
          moldura quadrada em vez do canto (aqui a moldura é maior e
          centralizada, o canto ficaria longe demais do centro visual). */}
      {isVip && (
        <span
          className="absolute -bottom-1.5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black shadow-sm"
          style={{ backgroundColor: "var(--vip-accent)" }}
        >
          <Crown className="size-3 vip-badge-crown" />
          VIP
        </span>
      )}
    </div>
  )

  // Sem foto enviada, o fallback de iniciais não tem o que ampliar.
  if (!src) return frame

  return (
    <ProfileImageLightbox src={src} alt={`Foto de perfil de ${name}`} unoptimized={animated}>
      {frame}
    </ProfileImageLightbox>
  )
}
