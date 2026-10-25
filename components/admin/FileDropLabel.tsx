"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useFileDrop } from "@/lib/hooks/use-file-drop"

const DRAGGING_CLASS = "border-primary bg-primary/10 text-foreground"

/**
 * Área que aceita imagens ARRASTADAS do computador. Use em volta de um grupo
 * inteiro (rótulo + miniaturas + botão): o alvo de um botão de 36px sozinho é
 * pequeno demais, e errar por poucos pixels soltava o arquivo fora.
 * Dentro dela, o botão de escolher é um `FileDropLabel droppable={false}`
 * (duas áreas aninhadas receberiam o mesmo drop).
 */
export function FileDropArea({
  onFiles,
  disabled,
  className,
  draggingClassName = DRAGGING_CLASS,
  children,
}: {
  onFiles: (files: File[]) => void
  disabled?: boolean
  className?: string
  draggingClassName?: string
  children: ReactNode
}) {
  const { dragging, dropProps } = useFileDrop(onFiles, { disabled })

  return (
    <div {...dropProps} className={cn(className, dragging && draggingClassName)}>
      {children}
    </div>
  )
}

/**
 * Botão de upload de imagem que também aceita arquivos ARRASTADOS do
 * computador. É um `<label>` com o `<input type="file">` escondido dentro,
 * igual aos botões que já existiam: o clique continua abrindo o seletor.
 */
export function FileDropLabel({
  onFiles,
  disabled,
  multiple,
  droppable = true,
  className,
  draggingClassName = DRAGGING_CLASS,
  children,
}: {
  onFiles: (files: File[]) => void
  disabled?: boolean
  multiple?: boolean
  droppable?: boolean
  className?: string
  draggingClassName?: string
  children: ReactNode
}) {
  const { dragging, dropProps } = useFileDrop(onFiles, { disabled: disabled || !droppable })

  return (
    <label {...(droppable ? dropProps : {})} className={cn(className, dragging && draggingClassName)}>
      <input
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ""
          if (files.length > 0) onFiles(files)
        }}
      />
      {children}
    </label>
  )
}
