import { ImageWithFallback } from "@/components/ui/image-with-fallback"
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
 * O redimensionamento vem do storage (ver `lib/image-loader.ts`). A capa de um
 * VIP com GIF pula esse caminho (`unoptimized`) e chega como foi enviada, sem
 * perder quadros na reamostragem.
 */
export function Banner({ bannerUrl, tier, className }: BannerProps) {
  const { src, animated } = resolveProfileMedia(bannerUrl, tier)

  return (
    <div
      className={cn(
        // O gradiente fica sempre no fundo: capa ausente — ou que falhe ao
        // carregar — descobre ele em vez de deixar uma faixa vazia.
        "relative h-32 w-full overflow-hidden bg-gradient-to-br from-primary/20 via-muted/40 to-background sm:h-44 md:h-56",
        className
      )}
    >
      <ImageWithFallback
        src={src}
        alt=""
        fill
        priority
        unoptimized={animated}
        sizes="(max-width: 768px) 100vw, 1024px"
        className="object-cover"
        fallback={null}
      />
      {/* Escurece a base para o avatar e o nome manterem contraste. */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
    </div>
  )
}
