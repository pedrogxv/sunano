"use client"

import { useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, Loader2, ZoomIn } from "lucide-react"

import { MediaViewer } from "@/components/ui/media-viewer"

/**
 * Imagem(ns) do post com opção de abrir em tamanho grande (lupa no hover).
 * Com mais de uma imagem a miniatura vira carrossel (setinhas + dots), estilo
 * Reddit.
 *
 * O modal em si é o `MediaViewer` compartilhado (mesmo de perfil, periféricos
 * e loja): antes era um dialog próprio com zoom fixo 2× e **sem arraste**, o
 * que deixava as bordas da imagem inalcançáveis justamente quando ampliada.
 * Agora ganha zoom em passos, arraste livre, miniaturas de todas as imagens do
 * post e navegação por teclado, sem que os chamadores mudem — a API
 * (`srcs`/`alt`) continua a mesma.
 */
export function ImageLightbox({ srcs, alt }: { srcs: string[]; alt: string }) {
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [loadedThumb, setLoadedThumb] = useState<number | null>(null)

  if (srcs.length === 0) return null

  const hasMultiple = srcs.length > 1
  const thumbLoading = loadedThumb !== index

  function go(delta: number, event?: React.MouseEvent) {
    event?.stopPropagation()
    setIndex((prev) => (prev + delta + srcs.length) % srcs.length)
  }

  const items = srcs.map((src, i) => ({
    src,
    alt: hasMultiple ? `${alt} (${i + 1} de ${srcs.length})` : alt,
    // GIF de post passa direto, igual à miniatura — reamostrar perde quadros.
    unoptimized: true,
  }))

  return (
    <>
      {/* A miniatura é do próprio card do post (com carrossel), então o
          visualizador entra no modo controlado e só abre o modal. */}
      <MediaViewer items={items} index={index} open={open} onOpenChange={setOpen} />

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
        className="group/lightbox relative z-10 mt-3 block aspect-[16/10] max-h-[420px] w-full overflow-hidden rounded-lg border border-border/50 bg-muted pointer-events-auto"
      >
        <Image
          key={srcs[index]}
          src={srcs[index]}
          alt={alt}
          fill
          unoptimized
          onLoad={() => setLoadedThumb(index)}
          className={`object-contain transition-opacity duration-150 ${
            thumbLoading ? "opacity-0" : "opacity-100"
          }`}
        />
        {thumbLoading && (
          <span className="absolute inset-0 flex items-center justify-center bg-muted">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </span>
        )}
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
    </>
  )
}
