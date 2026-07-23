"use client"

import { useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { VisuallyHidden } from "radix-ui"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const MAX_THUMBS = 4

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

  const openAt = (index: number) => {
    setActiveIndex(index)
    setOpen(true)
  }

  const thumbCount = Math.min(MAX_THUMBS, photos.length - 1)
  const thumbs = photos.slice(1, 1 + thumbCount)
  const remaining = photos.length - 1 - thumbCount

  const showNext = () => setActiveIndex((i) => (i + 1) % photos.length)
  const showPrev = () => setActiveIndex((i) => (i - 1 + photos.length) % photos.length)

  return (
    <>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => openAt(0)}
          className="relative block aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-muted/40"
        >
          <Image
            alt={alt}
            src={photos[0]}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
        </button>

        {thumbs.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {thumbs.map((photo, i) => {
              const index = i + 1
              const isLastVisible = i === thumbs.length - 1 && remaining > 0
              return (
                <button
                  key={`${photo}-${index}`}
                  type="button"
                  onClick={() => openAt(index)}
                  className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted/30"
                >
                  <Image
                    alt={alt}
                    src={photo}
                    fill
                    sizes="(max-width: 1024px) 25vw, 12vw"
                    className="object-cover"
                  />
                  {isLastVisible && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-semibold text-white">
                      +{remaining} fotos
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* sem `max-w-3xl` sem prefixo: o tailwind-merge o trataria como conflito e
            descartaria o `max-w-[calc(100%-2rem)]` do DialogContent, colando o modal
            nas bordas da tela no mobile */}
        <DialogContent className="border-border bg-background p-3 sm:max-w-3xl">
          <VisuallyHidden.Root asChild>
            <DialogTitle>{alt}</DialogTitle>
          </VisuallyHidden.Root>
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/40">
            <Image
              alt={alt}
              src={photos[activeIndex]}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-contain"
            />

            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={showPrev}
                  aria-label="Foto anterior"
                  className="absolute left-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={showNext}
                  aria-label="Próxima foto"
                  className="absolute right-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
          </div>

          {photos.length > 1 && (
            <div className="flex items-center justify-between gap-3 px-1">
              <span className="shrink-0 text-xs text-muted-foreground">
                {activeIndex + 1} / {photos.length}
              </span>
              <div className="flex gap-1.5 overflow-x-auto">
                {photos.map((photo, index) => (
                  <button
                    key={`${photo}-${index}`}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={cn(
                      "relative size-11 shrink-0 overflow-hidden rounded-md border-2 transition",
                      index === activeIndex ? "border-primary" : "border-transparent opacity-60 hover:opacity-100",
                    )}
                  >
                    <Image alt={alt} src={photo} fill sizes="44px" className="object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
