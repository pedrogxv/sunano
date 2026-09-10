"use client"

import { useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, ZoomIn } from "lucide-react"

import { MediaViewer } from "@/components/ui/media-viewer"
import { cn } from "@/lib/utils"

/**
 * Galeria da página do periférico: carrossel inline + visualizador ampliado.
 *
 * O modal deixou de ser próprio daqui e passou a ser o `MediaViewer`
 * compartilhado (mesmo do perfil, fórum e loja). Com isso o zoom fixo de 2,5×
 * virou escala em passos até 4×, entraram roda do mouse, teclado, miniaturas e
 * a barra de controles — e sumiu a duplicação de pan/zoom que existia igual
 * aqui, na loja e no fórum.
 */
export function PeripheralGallery({ images, alt }: { images: (string | null | undefined)[]; alt: string }) {
  const photos = images.filter((image): image is string => Boolean(image))
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  if (photos.length === 0) {
    return (
      <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-muted/40">
        <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-muted-foreground">
          {alt?.slice(0, 2)?.toUpperCase()}
        </div>
      </div>
    )
  }

  const showNext = (event?: React.MouseEvent) => {
    event?.stopPropagation()
    setActiveIndex((i) => (i + 1) % photos.length)
  }
  const showPrev = (event?: React.MouseEvent) => {
    event?.stopPropagation()
    setActiveIndex((i) => (i - 1 + photos.length) % photos.length)
  }

  const items = photos.map((src, index) => ({
    src,
    alt: photos.length > 1 ? `${alt} (${index + 1} de ${photos.length})` : alt,
  }))

  return (
    <>
      {/* A miniatura é o carrossel abaixo, então o visualizador entra no modo
          controlado e só desenha o modal. */}
      <MediaViewer items={items} index={activeIndex} open={open} onOpenChange={setOpen} />

      <div className="space-y-3">
        <div className="group/zoom relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-muted/40">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="block h-full w-full cursor-zoom-in"
            aria-label={`Ampliar ${alt}`}
          >
            <Image
              alt={alt}
              src={photos[activeIndex]}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-contain p-4"
            />
            <span className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover/zoom:opacity-100">
              <ZoomIn className="size-5" />
            </span>
          </button>

          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={showPrev}
                aria-label="Foto anterior"
                className="absolute left-2 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={showNext}
                aria-label="Próxima foto"
                className="absolute right-2 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
        </div>

        {photos.length > 1 && (
          <div className="flex items-center justify-center gap-1.5">
            {photos.map((photo, index) => (
              <button
                key={`${photo}-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Ver foto ${index + 1}`}
                aria-current={index === activeIndex}
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  index === activeIndex ? "bg-foreground" : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
