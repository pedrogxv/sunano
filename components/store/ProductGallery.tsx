"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, Play, ZoomIn } from "lucide-react"

import { SoldOutStamp } from "@/components/store/SoldOutStamp"
import { MediaViewer } from "@/components/ui/media-viewer"
import { markImageSettled } from "@/lib/image-settled"
import { getCategoryIcon } from "@/lib/store-category-icons"
import { cn } from "@/lib/utils"
import { extractYoutubeVideoId } from "@/lib/youtube-url"

type GalleryItem = { kind: "image"; src: string } | { kind: "video"; videoId: string }

interface ProductGalleryProps {
  /** Fotos da combinação escolhida (a da combinação primeiro, depois as da cor ou do produto). */
  images: string[]
  /** Link do YouTube cadastrado no produto. */
  videoUrl: string | null
  productName: string
  category: string | null
  /** Produto (ou a combinação escolhida) esgotado: fotos em cinza com o carimbo. */
  soldOut?: boolean
}

/**
 * Galeria da página do produto: foto grande, miniaturas e o vídeo do produto
 * como mais um item da fila. O vídeo entra logo depois da primeira foto, que
 * é onde quem está avaliando a compra ainda está olhando; no fim da fila,
 * atrás de seis fotos, ninguém o encontrava.
 *
 * Quem troca de combinação (Mini → Max) troca as fotos: a página remonta a
 * galeria pela primeira foto (`key`), e ela volta para o começo mostrando a
 * versão escolhida, em vez de ficar na 4ª foto de outra versão.
 */
export function ProductGallery({ images, videoUrl, productName, category, soldOut = false }: ProductGalleryProps) {
  const videoId = videoUrl ? extractYoutubeVideoId(videoUrl) : null
  const items: GalleryItem[] = images.map((src) => ({ kind: "image" as const, src }))
  if (videoId) items.splice(Math.min(1, items.length), 0, { kind: "video", videoId })

  const [active, setActive] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const { icon: CategoryIcon, tint } = getCategoryIcon(category)

  const current = items[active] ?? null
  const imageItems = items.filter((item): item is Extract<GalleryItem, { kind: "image" }> => item.kind === "image")
  const lightboxIndex = current?.kind === "image" ? imageItems.findIndex((item) => item.src === current.src) : 0
  const hasMany = items.length > 1

  function go(delta: number) {
    setActive((index) => (index + delta + items.length) % items.length)
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse lg:items-start">
      {/* Visualizador compartilhado (mesmo do perfil, fórum e periféricos). */}
      <MediaViewer
        items={imageItems.map((item, index) => ({
          src: item.src,
          alt: imageItems.length > 1 ? `${productName} (${index + 1} de ${imageItems.length})` : productName,
        }))}
        index={Math.max(lightboxIndex, 0)}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
      />

      <div className="group/stage relative aspect-square w-full overflow-hidden rounded-[24px] border border-border/40 bg-transparent lg:max-h-[calc(100vh-var(--sticky-header-h)-3rem)] lg:flex-1">
        {current?.kind === "video" ? (
          <iframe
            key={current.videoId}
            src={`https://www.youtube-nocookie.com/embed/${current.videoId}?autoplay=1&rel=0`}
            title={`Vídeo: ${productName}`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        ) : current?.kind === "image" ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="block h-full w-full cursor-zoom-in"
            aria-label="Ampliar imagem"
          >
            {loadedSrc !== current.src && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="size-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-emerald-500" />
              </span>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={current.src}
              src={current.src}
              alt={productName}
              ref={(el) => markImageSettled(el, () => setLoadedSrc(current.src))}
              onLoad={() => setLoadedSrc(current.src)}
              onError={() => setLoadedSrc(current.src)}
              className={cn(
                "h-full w-full object-contain p-6 transition-opacity duration-150 sm:p-8",
                loadedSrc === current.src ? (soldOut ? "opacity-45 grayscale" : "opacity-100") : "opacity-0"
              )}
            />
            {/* O lightbox continua colorido: quem amplia quer ver o produto. */}
            {soldOut && <SoldOutStamp size="lg" />}
            <span className="absolute right-4 top-4 hidden size-11 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover/stage:opacity-100 sm:flex">
              <ZoomIn className="size-5" />
            </span>
          </button>
        ) : (
          <div
            className="flex h-full items-center justify-center"
            style={{ background: `radial-gradient(90% 90% at 50% 30%, color-mix(in oklab, ${tint} 14%, var(--card-image-bg)), var(--card-image-bg))` }}
          >
            <CategoryIcon className="size-44 opacity-40" style={{ color: tint }} strokeWidth={1.1} />
          </div>
        )}

        {hasMany && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Mídia anterior"
              className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-opacity sm:opacity-0 sm:group-hover/stage:opacity-100"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Próxima mídia"
              className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-opacity sm:opacity-0 sm:group-hover/stage:opacity-100"
            >
              <ChevronRight className="size-5" />
            </button>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
              {active + 1}/{items.length}
            </span>
          </>
        )}
      </div>

      {hasMany && (
        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide lg:max-h-[calc(100vh-var(--sticky-header-h)-3rem)] lg:w-[76px] lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-0">
          {items.map((item, index) => (
            <button
              key={item.kind === "image" ? item.src : `video-${item.videoId}`}
              type="button"
              onClick={() => setActive(index)}
              aria-label={item.kind === "video" ? "Ver vídeo do produto" : `Ver foto ${index + 1}`}
              aria-current={index === active}
              className={cn(
                "relative size-[68px] shrink-0 overflow-hidden rounded-2xl border-[1.5px] bg-transparent transition-colors lg:size-[76px]",
                index === active ? "border-emerald-500" : "border-border/60 hover:border-foreground/30"
              )}
            >
              {item.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.src} alt="" className={cn("h-full w-full object-contain p-1.5", soldOut && "opacity-50 grayscale")} loading="lazy" decoding="async" />
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/45 text-white">
                    <Play className="size-5 fill-current" />
                    <span className="text-[9px] font-bold uppercase tracking-wide">Vídeo</span>
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
