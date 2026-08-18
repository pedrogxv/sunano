"use client"

import { useState, type RefObject } from "react"
import { Bold, CaseUpper, Highlighter, Italic, Link2, Underline } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * Aplica/remove um marcador (`**`/`*`/`__`) em volta do texto selecionado no
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

/** Envolve o texto selecionado (ou o próprio link) em `[texto](url)`, no formato aceito por `parseTextMarkdown`. */
function insertLink(textarea: HTMLTextAreaElement, url: string, onChange: (value: string) => void) {
  const { selectionStart, selectionEnd, value } = textarea
  const selected = value.slice(selectionStart, selectionEnd)
  const before = value.slice(0, selectionStart)
  const after = value.slice(selectionEnd)
  const inserted = `[${selected || url}](${url})`

  onChange(`${before}${inserted}${after}`)
  requestAnimationFrame(() => {
    textarea.focus()
    const cursor = before.length + inserted.length
    textarea.setSelectionRange(cursor, cursor)
  })
}

/** Botão de link com popover pra digitar a URL — só ele precisa de mais que um clique. */
function LinkFormatButton({
  textareaRef,
  onChange,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")

  function confirm() {
    const textarea = textareaRef.current
    const trimmed = url.trim()
    if (!textarea || !trimmed) return
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    insertLink(textarea, normalized, onChange)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setUrl("")
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Link ([texto](url))"
          className="rounded p-1.5 transition-colors hover:bg-muted hover:text-foreground"
        >
          <Link2 className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <p className="mb-1.5 text-xs font-medium text-foreground">Inserir link</p>
        <Input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              confirm()
            }
          }}
          placeholder="https://exemplo.com"
          className="h-8 text-sm"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={confirm}
            disabled={!url.trim()}
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Inserir
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Barra compacta de formatação (negrito, itálico, sublinhado, destaque, link, maiúsculo) para um textarea controlado. */
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
        title="Sublinhado (__texto__)"
        onClick={withTextarea((t) => toggleWrap(t, "__", onChange))}
        className="rounded p-1.5 transition-colors hover:bg-muted hover:text-foreground"
      >
        <Underline className="size-3.5" />
      </button>
      <button
        type="button"
        title="Destaque (==texto==)"
        onClick={withTextarea((t) => toggleWrap(t, "==", onChange))}
        className="rounded p-1.5 transition-colors hover:bg-muted hover:text-foreground"
      >
        <Highlighter className="size-3.5" />
      </button>
      <LinkFormatButton textareaRef={textareaRef} onChange={onChange} />
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
