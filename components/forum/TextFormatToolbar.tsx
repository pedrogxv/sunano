"use client"

import type { RefObject } from "react"
import { Bold, CaseUpper, Italic } from "lucide-react"

/**
 * Aplica/remove um marcador (`**`/`*`) em volta do texto selecionado no
 * textarea. Sem seleção, insere o par de marcadores no cursor e deixa o
 * cursor entre eles, pronto pra digitar.
 */
function toggleWrap(textarea: HTMLTextAreaElement, marker: string, onChange: (value: string) => void) {
  const { selectionStart, selectionEnd, value } = textarea
  const selected = value.slice(selectionStart, selectionEnd)
  const before = value.slice(0, selectionStart)
  const after = value.slice(selectionEnd)

  const alreadyWrapped =
    before.endsWith(marker) && after.startsWith(marker) && selected.length > 0

  let next: string
  let cursorStart: number
  let cursorEnd: number

  if (alreadyWrapped) {
    next = before.slice(0, -marker.length) + selected + after.slice(marker.length)
    cursorStart = selectionStart - marker.length
    cursorEnd = selectionEnd - marker.length
  } else {
    next = `${before}${marker}${selected}${marker}${after}`
    cursorStart = selectionStart + marker.length
    cursorEnd = selectionEnd + marker.length
  }

  onChange(next)
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(cursorStart, cursorEnd)
  })
}

function toUppercase(textarea: HTMLTextAreaElement, onChange: (value: string) => void) {
  const { selectionStart, selectionEnd, value } = textarea
  if (selectionStart === selectionEnd) return
  const selected = value.slice(selectionStart, selectionEnd)
  const next = value.slice(0, selectionStart) + selected.toUpperCase() + value.slice(selectionEnd)

  onChange(next)
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(selectionStart, selectionEnd)
  })
}

/** Barra compacta de formatação (negrito, itálico, maiúsculo) para um textarea controlado. */
export function TextFormatToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (value: string) => void
}) {
  const withTextarea = (fn: (textarea: HTMLTextAreaElement) => void) => () => {
    const textarea = textareaRef.current
    if (textarea) fn(textarea)
  }

  return (
    <div className="flex items-center gap-0.5 text-muted-foreground">
      <button
        type="button"
        title="Negrito (**texto**)"
        onClick={withTextarea((t) => toggleWrap(t, "**", onChange))}
        className="rounded p-1.5 transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bold className="size-3.5" />
      </button>
      <button
        type="button"
        title="Itálico (*texto*)"
        onClick={withTextarea((t) => toggleWrap(t, "*", onChange))}
        className="rounded p-1.5 transition-colors hover:bg-muted hover:text-foreground"
      >
        <Italic className="size-3.5" />
      </button>
      <button
        type="button"
        title="Maiúsculo"
        onClick={withTextarea((t) => toUppercase(t, onChange))}
        className="rounded p-1.5 transition-colors hover:bg-muted hover:text-foreground"
      >
        <CaseUpper className="size-3.5" />
      </button>
    </div>
  )
}
