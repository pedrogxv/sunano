"use client"

import { useEffect, useRef, useState } from "react"
import { Bold, Highlighter, Italic, Link2, Underline } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  insertLineBreak,
  insertOrWrapLink,
  insertPlainTextMultiline,
  markdownToNodes,
  serializeEditor,
  toggleInlineFormat,
  type FormatTag,
} from "@/lib/rich-text-markdown"
import { cn } from "@/lib/utils"

/**
 * Editor rich-text (contenteditable) pro mesmo dialeto de `lib/comment-markdown.ts`
 * (negrito/itálico/sublinhado/destaque/link) — mas ao contrário do textarea +
 * `TextFormatToolbar` do fórum/comentários, aqui a formatação aparece JÁ
 * aplicada enquanto digita (estilo Telegram), sem mostrar `**`/`[]()` no meio
 * do texto. O valor que entra e sai (`value`/`onChange`) continua sendo a
 * MESMA string com marcadores — quem lê do banco e quem renderiza no site
 * (`FormattedText`) não muda nada. A manipulação de `Range`/DOM em si mora em
 * `lib/rich-text-markdown.ts` (pura, testável sem montar este componente).
 *
 * Cabeçalho (`#`/`##`/`###`) e lista (`- item`) do dialeto não têm botão aqui
 * de propósito — são estruturais (linha inteira), não um estilo de seleção
 * pontual como negrito/itálico/link, e não foram pedidos. Texto que já tinha
 * esses marcadores (digitado antes, no textarea antigo) continua intacto e
 * continua renderizando certo no site — só não vira um heading/lista visível
 * AQUI dentro do editor, fica como texto puro na tela de edição.
 */

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const placeholderRef = useRef<HTMLSpanElement>(null)
  const lastEmittedRef = useRef<string | null>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")

  // Visibilidade do placeholder é puramente imperativa (não é estado React):
  // o conteúdo do editor já é gerenciado fora do virtual DOM (ver abaixo), e
  // mexer nisso via `setState` dentro do efeito de sincronização causaria
  // um render em cascata a cada troca de item.
  function syncPlaceholderVisibility(editor: HTMLDivElement) {
    const empty = (editor.textContent ?? "").length === 0
    if (placeholderRef.current) placeholderRef.current.style.display = empty ? "" : "none"
  }

  // Só reconstrói o DOM quando `value` muda de FORA (carregar outro item,
  // reset de formulário) — reconstruir a cada tecla própria jogaria o cursor
  // pro início toda vez.
  useEffect(() => {
    if (value === lastEmittedRef.current) return
    const editor = editorRef.current
    if (!editor) return
    editor.innerHTML = ""
    for (const node of markdownToNodes(value)) editor.appendChild(node)
    lastEmittedRef.current = value
    syncPlaceholderVisibility(editor)
  }, [value])

  function handleInput() {
    const editor = editorRef.current
    if (!editor) return
    const markdown = serializeEditor(editor)
    lastEmittedRef.current = markdown
    syncPlaceholderVisibility(editor)
    onChange(markdown)
  }

  function getEditorSelection(): { selection: Selection; range: Range } | null {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.commonAncestorContainer)) return null
    return { selection, range }
  }

  function applyFormat(tag: FormatTag) {
    const editor = editorRef.current
    const found = getEditorSelection()
    if (!editor || !found) return
    const newRange = toggleInlineFormat(found.range, tag, editor)
    found.selection.removeAllRanges()
    found.selection.addRange(newRange)
    handleInput()
  }

  function saveSelectionForLink() {
    const found = getEditorSelection()
    savedRangeRef.current = found ? found.range.cloneRange() : null
  }

  function confirmLink() {
    const range = savedRangeRef.current
    const trimmed = linkUrl.trim()
    if (!range || !trimmed) return
    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

    // O foco tá no popover (o input de URL tem autoFocus) — devolve pro
    // editor antes de mexer na seleção, senão o range novo fica "certo" mas
    // sem foco nenhum, e a próxima tecla digitada não vai pra lugar nenhum.
    editorRef.current?.focus()
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    const newRange = insertOrWrapLink(range, href)
    selection?.removeAllRanges()
    selection?.addRange(newRange)

    handleInput()
    setLinkOpen(false)
    setLinkUrl("")
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const isMeta = event.metaKey || event.ctrlKey
    if (isMeta && event.key.toLowerCase() === "b") {
      event.preventDefault()
      applyFormat("strong")
      return
    }
    if (isMeta && event.key.toLowerCase() === "i") {
      event.preventDefault()
      applyFormat("em")
      return
    }
    if (isMeta && event.key.toLowerCase() === "u") {
      event.preventDefault()
      applyFormat("u")
      return
    }
    if (isMeta && event.key.toLowerCase() === "k") {
      event.preventDefault()
      saveSelectionForLink()
      setLinkUrl("")
      setLinkOpen(true)
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const found = getEditorSelection()
      if (!found) return
      const newRange = insertLineBreak(found.range)
      found.selection.removeAllRanges()
      found.selection.addRange(newRange)
      handleInput()
    }
  }

  // Cola sempre como texto puro (quebrando em `<br>` por linha) — colar HTML
  // de fora (Word, Google Docs) traria negrito/cor/fonte que não existem no
  // dialeto e ficaria bagunçado tanto na tela quanto ao serializar.
  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault()
    const text = event.clipboardData.getData("text/plain")
    if (!text) return
    const found = getEditorSelection()
    if (!found) return
    const newRange = insertPlainTextMultiline(found.range, text)
    found.selection.removeAllRanges()
    found.selection.addRange(newRange)
    handleInput()
  }

  const toolbarButtonClass = "rounded p-1.5 transition-colors hover:bg-muted hover:text-foreground"

  return (
    <div
      className={cn(
        "flex rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        className,
      )}
    >
      <div className="flex flex-col gap-1 border-r border-input p-1">
        <button
          type="button"
          title="Negrito (Ctrl+B)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat("strong")}
          className={cn(toolbarButtonClass, "text-muted-foreground")}
        >
          <Bold className="size-3.5" />
        </button>
        <button
          type="button"
          title="Itálico (Ctrl+I)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat("em")}
          className={cn(toolbarButtonClass, "text-muted-foreground")}
        >
          <Italic className="size-3.5" />
        </button>
        <button
          type="button"
          title="Sublinhado (Ctrl+U)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat("u")}
          className={cn(toolbarButtonClass, "text-muted-foreground")}
        >
          <Underline className="size-3.5" />
        </button>
        <button
          type="button"
          title="Destaque"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat("mark")}
          className={cn(toolbarButtonClass, "text-muted-foreground")}
        >
          <Highlighter className="size-3.5" />
        </button>
        <Popover
          open={linkOpen}
          onOpenChange={(next) => {
            setLinkOpen(next)
            if (next) setLinkUrl("")
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Link (Ctrl+K)"
              onMouseDown={(e) => {
                e.preventDefault()
                saveSelectionForLink()
              }}
              className={cn(toolbarButtonClass, "text-muted-foreground")}
            >
              <Link2 className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64">
            <p className="mb-1.5 text-xs font-medium text-foreground">Inserir link</p>
            <Input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  confirmLink()
                }
              }}
              placeholder="https://sunano.com.br/perifericos/... ou /loja/..."
              className="h-8 text-sm"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={confirmLink}
                disabled={!linkUrl.trim()}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Inserir
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="relative min-w-0 flex-1">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="min-h-16 w-full whitespace-pre-wrap break-words px-2.5 py-2 text-base outline-none md:text-sm"
        />
        <span
          ref={placeholderRef}
          style={value.length === 0 ? undefined : { display: "none" }}
          className="pointer-events-none absolute left-2.5 top-2 text-base text-muted-foreground md:text-sm"
        >
          {placeholder}
        </span>
      </div>
    </div>
  )
}
