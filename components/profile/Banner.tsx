import Image from "next/image"

import { resolveProfileMedia, type AccountTier } from "@/lib/account-tier"
import { cn } from "@/lib/utils"

interface BannerProps {
  bannerUrl: string | null
  tier: AccountTier
  className?: string
}

/**
 * Capa do perfil. Ocupa a largura total do card e reserva espaço embaixo
 * para a foto sobreposta (ver `AvatarFoto`).
 *
 * GIF só anima para VIP: `animated` liga `unoptimized`, deixando o arquivo
 * passar intacto. Sem ele, o otimizador do Next serve apenas o primeiro
 * quadro — que é exatamente o comportamento desejado para contas comuns.
 */
export function Banner({ bannerUrl, tier, className }: BannerProps) {
  const { src, animated } = resolveProfileMedia(bannerUrl, tier)

  return (
    <div
      className={cn(
        "relative h-32 w-full overflow-hidden sm:h-44 md:h-56",
        !src && "bg-gradient-to-br from-primary/20 via-muted/40 to-background",
        className
      )}
    >
      {src && (
        <Image
          src={src}
          alt=""
          fill
          priority
          unoptimized={animated}
          sizes="(max-width: 768px) 100vw, 1024px"
          className="object-cover"
        />
      )}
      {/* Escurece a base para o avatar e o nome manterem contraste. */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
    </div>
  )
}
