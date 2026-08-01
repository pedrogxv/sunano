"use client"

import Image, { type ImageProps } from "next/image"
import { useState, type ReactNode } from "react"

type ImageWithFallbackProps = Omit<ImageProps, "src" | "onError"> & {
  src: string | null | undefined
  /** Renderizado quando não há imagem, ou quando ela falha ao carregar. */
  fallback: ReactNode
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
export function ImageWithFallback({ src, alt, fallback, ...imageProps }: ImageWithFallbackProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (!src || failedSrc === src) return <>{fallback}</>

  return <Image {...imageProps} src={src} alt={alt} onError={() => setFailedSrc(src)} />
}
