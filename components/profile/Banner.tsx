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
        className="h-full w-full object-cover object-center"
        fallback={null}
      />
      {/* Escurece só a faixa de baixo — onde o avatar e o nome se apoiam.
          Cobrindo o `inset-0` inteiro, o degradê apagava metade da capa e ela
          parecia meio preta. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background/70 to-transparent" />
    </div>
  )
}
