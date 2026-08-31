"use client"

import { useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { VisuallyHidden } from "radix-ui"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const ZOOM_SCALE = 2.5
const PAN_LIMIT = 220

export function PeripheralGallery({ images, alt }: { images: (string | null | undefined)[]; alt: string }) {
  const photos = images.filter((image): image is string => Boolean(image))
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(
    null
  )

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

  function clampPan(x: number, y: number) {
    return {
      x: Math.min(PAN_LIMIT, Math.max(-PAN_LIMIT, x)),
      y: Math.min(PAN_LIMIT, Math.max(-PAN_LIMIT, y)),
    }
  }

  function handleZoomPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!zoomed) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false })
  }

  function handleZoomPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!zoomed || !drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    const next = clampPan(drag.panX + dx, drag.panY + dy)
    setPan(next)
    if (!drag.moved && Math.hypot(dx, dy) > 4) setDrag({ ...drag, moved: true })
  }

  function handleZoomPointerUp() {
    setDrag(null)
  }

  function toggleZoom() {
    if (drag?.moved) return
    setZoomed((z) => {
      if (z) setPan({ x: 0, y: 0 })
      return !z
    })
  }

  return (
    <>
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

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            setZoomed(false)
            setPan({ x: 0, y: 0 })
          }
        }}
      >
        {/* sem `max-w-3xl` sem prefixo: o tailwind-merge o trataria como conflito e
            descartaria o `max-w-[calc(100%-2rem)]` do DialogContent, colando o modal
            nas bordas da tela no mobile */}
        <DialogContent
          showCloseButton
          className="flex max-w-4xl items-center justify-center overflow-hidden border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-4xl"
        >
          <VisuallyHidden.Root asChild>
            <DialogTitle>{alt}</DialogTitle>
          </VisuallyHidden.Root>
          <div className="relative w-full">
            <div
              onPointerDown={handleZoomPointerDown}
              onPointerMove={handleZoomPointerMove}
              onPointerUp={handleZoomPointerUp}
              onPointerLeave={handleZoomPointerUp}
              onDoubleClick={toggleZoom}
              className={cn(
                "relative mx-auto h-[85vh] w-full touch-none overflow-hidden rounded-lg select-none",
                zoomed ? (drag ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={photos[activeIndex]}
                src={photos[activeIndex]}
                alt={alt}
                draggable={false}
                onClick={toggleZoom}
                className={cn("h-full w-full object-contain", !drag && "transition-transform duration-200")}
                style={{
                  transform: zoomed
                    ? `scale(${ZOOM_SCALE}) translate(${pan.x / ZOOM_SCALE}px, ${pan.y / ZOOM_SCALE}px)`
                    : "scale(1)",
                }}
              />
              {!zoomed && (
                <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur-sm">
                  Clique para ampliar
                </span>
              )}
            </div>

            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={showPrev}
                  aria-label="Foto anterior"
                  className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={showNext}
                  aria-label="Próxima foto"
                  className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                >
                  <ChevronRight className="size-6" />
                </button>
                <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 backdrop-blur-sm">
                  {photos.map((photo, index) => (
                    <span
                      key={`${photo}-${index}`}
                      className={cn(
                        "size-1.5 rounded-full transition-colors",
                        index === activeIndex ? "bg-white" : "bg-white/40"
                      )}
                    />
                  ))}
                </span>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
