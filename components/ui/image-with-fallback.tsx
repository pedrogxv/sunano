"use client"

import Image, { type ImageProps } from "next/image"
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react"

import { cn } from "@/lib/utils"

type ImageWithFallbackProps = Omit<ImageProps, "src" | "onError"> & {
  src: string | null | undefined
  /** Renderizado quando não há imagem, ou quando ela falha ao carregar. */
  fallback: ReactNode
  /**
   * Congela o primeiro quadro num `<canvas>` em vez de exibir a imagem —
   * usado quando o arquivo é GIF mas o tier atual do dono não libera
   * animação (ver `needsFreeze` em `resolveProfileMedia`, `lib/account-tier.ts`).
   */
  freeze?: boolean
}

/**
 * Imagem que cai no fallback quando o carregamento falha.
 *
 * Um `<img>` com `src` inválido não some: o navegador desenha o ícone de
 * imagem quebrada e escreve o `alt` por cima, que é como um avatar virava um
 * círculo preto com o nick vazando no canto. Só checar `src != null` na
 * renderização não cobre isso — o erro acontece depois, na rede, então
 * precisa de estado.
 *
 * O `src` que falhou fica guardado (em vez de um booleano) para que trocar a
 * imagem por outra volte a tentar carregar, sem precisar remontar o
 * componente.
 */
export function ImageWithFallback({
  src,
  alt,
  fallback,
  freeze = false,
  ...imageProps
}: ImageWithFallbackProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (!src || failedSrc === src) return <>{fallback}</>

  if (freeze) {
    return (
      <FrozenFrame
        src={src}
        alt={alt}
        fill={imageProps.fill}
        className={imageProps.className}
        style={imageProps.style}
        onError={() => setFailedSrc(src)}
      />
    )
  }

  return <Image {...imageProps} src={src} alt={alt} onError={() => setFailedSrc(src)} />
}

/**
 * Desenha só o primeiro quadro de `src` num `<canvas>`. Não usa `crossOrigin`
 * de propósito: sem ele o canvas fica "tainted" para leitura de pixels
 * (`toDataURL`/`getImageData`), mas `drawImage` continua funcionando — e como
 * nunca lemos os pixels de volta, evita depender do bucket enviar cabeçalhos
 * CORS.
 *
 * Exportado à parte porque `ProfileImageLightbox` renderiza `next/image`
 * direto (sem passar por `ImageWithFallback`) e precisa do mesmo congelamento
 * quando reabre a mesma mídia em tamanho grande.
 */
export function FrozenFrame({
  src,
  alt,
  fill,
  className,
  style,
  onClick,
  onError,
}: {
  src: string
  alt: string
  fill?: boolean
  className?: string
  style?: CSSProperties
  onClick?: (event: MouseEvent<HTMLCanvasElement>) => void
  onError: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    const img = new window.Image()
    img.onload = () => {
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext("2d")?.drawImage(img, 0, 0)
    }
    img.onerror = () => {
      if (!cancelled) onError()
    }
    img.src = src
    return () => {
      cancelled = true
    }
  }, [src, onError])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={alt}
      onClick={onClick}
      className={cn(fill && "absolute inset-0 size-full", className)}
      style={style}
    />
  )
}
