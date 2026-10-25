"use client"

import { useEffect, useRef, useState, type DragEvent } from "react"

const IMAGE_EXTENSIONS = /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i

// Alguns arquivos (HEIC, arrastados de certos apps) chegam com `type` vazio:
// sem o fallback pela extensão o drop era ignorado sem aviso.
function matchesAccept(file: File, accept: string) {
  if (file.type) return file.type.startsWith(accept)
  return accept === "image/" && IMAGE_EXTENSIONS.test(file.name)
}

function hasFiles(dataTransfer: DataTransfer | null) {
  return !!dataTransfer && Array.from(dataTransfer.types).includes("Files")
}

/**
 * Soltar um arquivo FORA de uma área de drop faz o navegador abri-lo no lugar
 * da página, e o formulário em edição se perde. Monte na tela que tem áreas de
 * drop: as áreas continuam recebendo o evento antes (React escuta na raiz).
 */
export function usePreventFileDropNavigation() {
  useEffect(() => {
    function prevent(e: globalThis.DragEvent) {
      if (hasFiles(e.dataTransfer)) e.preventDefault()
    }
    window.addEventListener("dragover", prevent)
    window.addEventListener("drop", prevent)
    return () => {
      window.removeEventListener("dragover", prevent)
      window.removeEventListener("drop", prevent)
    }
  }, [])
}

/**
 * Arrastar arquivos do computador para uma área de upload. Devolve `dragging`
 * (para destacar a área) e os handlers para espalhar no elemento.
 *
 * Só reage a arrastos que carregam ARQUIVOS: a reordenação de miniaturas
 * (dnd-kit) e o arrasto nativo de uma `<img>` da própria página não acendem a
 * área nem disparam `onFiles`. O contador evita o pisca-pisca do `dragleave`
 * que o navegador dispara ao passar por cima de cada filho.
 */
export function useFileDrop(
  onFiles: (files: File[]) => void,
  { disabled = false, accept = "image/" }: { disabled?: boolean; accept?: string } = {}
) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)

  return {
    dragging: dragging && !disabled,
    dropProps: {
      onDragEnter(e: DragEvent<HTMLElement>) {
        if (!hasFiles(e.dataTransfer)) return
        e.preventDefault()
        depth.current += 1
        setDragging(true)
      },
      onDragOver(e: DragEvent<HTMLElement>) {
        if (!hasFiles(e.dataTransfer)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = disabled ? "none" : "copy"
      },
      onDragLeave(e: DragEvent<HTMLElement>) {
        if (!hasFiles(e.dataTransfer)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDragging(false)
      },
      onDrop(e: DragEvent<HTMLElement>) {
        if (!hasFiles(e.dataTransfer)) return
        e.preventDefault()
        depth.current = 0
        setDragging(false)
        if (disabled) return
        const files = Array.from(e.dataTransfer.files).filter((f) => matchesAccept(f, accept))
        if (files.length > 0) onFiles(files)
      },
    },
  }
}
