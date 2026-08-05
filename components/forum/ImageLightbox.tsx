"use client"

import { useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, ZoomIn } from "lucide-react"

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

/**
 * Imagem(ns) do post com opção de abrir em tamanho grande (lupa no hover).
 * Com mais de uma imagem vira carrossel (setinhas + dots), estilo Reddit —
 * tanto na miniatura quanto no dialog ampliado. Dentro do dialog, clicar na
 * imagem alterna entre tamanho normal e ampliado — sem pan, só o suficiente
 * pra examinar detalhe sem precisar de lib de zoom.
 */
export function ImageLightbox({ srcs, alt }: { srcs: string[]; alt: string }) {
  const [open, setOpen] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [index, setIndex] = useState(0)

  if (srcs.length === 0) return null

  const hasMultiple = srcs.length > 1

  function go(delta: number, event?: React.MouseEvent) {
    event?.stopPropagation()
    setIndex((prev) => (prev + delta + srcs.length) % srcs.length)
    setZoomed(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setZoomed(false)
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className="group/lightbox relative z-10 mt-3 block w-full overflow-hidden rounded-lg border border-border/50 pointer-events-auto"
        >
          <Image
            src={srcs[index]}
            alt={alt}
            width={640}
            height={400}
            unoptimized
            className="max-h-[420px] w-full object-cover"
          />
          <span className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover/lightbox:opacity-100">
            <ZoomIn className="size-4" />
          </span>

          {hasMultiple && (
            <>
              <span className="absolute right-2 top-2 flex items-center rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                {index + 1}/{srcs.length}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => go(-1, e)}
                className="absolute left-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover/lightbox:opacity-100"
              >
                <ChevronLeft className="size-5" />
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => go(1, e)}
                className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover/lightbox:opacity-100"
              >
                <ChevronRight className="size-5" />
              </span>
              <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1">
                {srcs.map((s, i) => (
                  <span
                    key={s}
                    className={`size-1.5 rounded-full transition-colors ${
                      i === index ? "bg-white" : "bg-white/40"
                    }`}
                  />
                ))}
              </span>
            </>
          )}
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className="flex max-w-4xl items-center justify-center overflow-hidden border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-4xl"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <div className="relative w-full">
          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            className={`relative max-h-[85vh] w-full overflow-auto rounded-lg ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
          >
            <Image
              src={srcs[index]}
              alt={alt}
              width={1600}
              height={1000}
              unoptimized
              className={`h-auto w-full transition-transform duration-200 ${zoomed ? "scale-[2]" : "scale-100"}`}
            />
          </button>

          {hasMultiple && (
            <>
              <button
                type="button"
                onClick={(e) => go(-1, e)}
                className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                onClick={(e) => go(1, e)}
                className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
              >
                <ChevronRight className="size-6" />
              </button>
              <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 backdrop-blur-sm">
                {srcs.map((s, i) => (
                  <span
                    key={s}
                    className={`size-1.5 rounded-full transition-colors ${
                      i === index ? "bg-white" : "bg-white/40"
                    }`}
                  />
                ))}
              </span>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
