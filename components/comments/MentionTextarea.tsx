"use client"

import { useEffect, useRef, useState } from "react"
import { AtSign, Loader2, X } from "lucide-react"

import { UserAvatar } from "@/components/ui/user-avatar"
import { cn } from "@/lib/utils"
import type { PublicProfileSummary } from "@/lib/user-directory"
import type { CommentMention } from "./types"

const MAX_MENTIONS = 2
const SEARCH_DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2

/**
 * Detecta um "@token" em digitação a partir da posição do cursor — só
 * dispara a busca quando o token está "aberto" (sem espaço depois), como no
 * autocomplete de menção de qualquer rede social.
 */
function activeMentionQuery(value: string, cursor: number): { start: number; query: string } | null {
  const uptoCursor = value.slice(0, cursor)
  const at = uptoCursor.lastIndexOf("@")
  if (at === -1) return null
  const between = uptoCursor.slice(at + 1)
  if (/[\s@]/.test(between)) return null
  return { start: at, query: between }
}

/**
 * Textarea com @menção de usuário — componente único reaproveitado por
 * qualquer formulário de comentário/resposta do site. Ao digitar "@", abre
 * na hora um mini-select flutuante: primeiro pede mais letras, depois mostra
 * "buscando…" e por fim a lista (ou "ninguém encontrado"), sempre com avatar
 * — nunca fica muda como um textarea comum. Ao escolher, insere "@Nome " no
 * texto e guarda o id do perfil para envio junto do comentário; cada menção
 * confirmada também vira um chip removível acima do campo.
 */
export function MentionTextarea({
  value,
  onChange,
  mentionedUsers,
  onMentionedUsersChange,
  placeholder,
  className,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  mentionedUsers: CommentMention[]
  onMentionedUsersChange: (users: CommentMention[]) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}) {
  const [suggestions, setSuggestions] = useState<PublicProfileSummary[]>([])
  // "idle" cobre "sem busca em andamento" e também o debounce antes do
  // fetch sair — a UI mostra "Buscando…" em ambos os casos, então não há
  // motivo pra um terceiro estado só para o intervalo do debounce.
  const [searchStatus, setSearchStatus] = useState<"idle" | "done">("idle")
  const [mentionRange, setMentionRange] = useState<{ start: number; query: string } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const mentionLimitReached = mentionedUsers.length >= MAX_MENTIONS
  const open = mentionRange !== null
  const currentQuery = mentionRange?.query ?? ""
  const shouldSearch = Boolean(mentionRange) && !mentionLimitReached && currentQuery.length >= MIN_QUERY_LENGTH

  useEffect(() => {
    if (!shouldSearch || !mentionRange) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(mentionRange.query)}&limit=6`, {
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((data) => {
          setSuggestions(data?.ok ? (data.profiles as PublicProfileSummary[]) : [])
          setActiveIndex(0)
          setSearchStatus("done")
        })
        .catch(() => {})
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [mentionRange, shouldSearch])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextValue = e.target.value
    onChange(nextValue)
    const range = activeMentionQuery(nextValue, e.target.selectionStart)
    setMentionRange(range)
    // Toda letra digitada invalida os resultados da query anterior — sem
    // isso, trocar "an" por "ana" mostraria a lista de "an" por um instante
    // (o `searchStatus` só vira "idle" de novo quando a query fica curta
    // demais, o que não é o caso aqui).
    setSuggestions([])
    setSearchStatus("idle")
  }

  function selectMention(profile: PublicProfileSummary) {
    const range = mentionRange
    const textarea = textareaRef.current
    if (!range || !textarea) return

    const cursor = textarea.selectionStart
    const before = value.slice(0, range.start)
    const after = value.slice(cursor)
    const inserted = `@${profile.display_name} `
    const nextValue = `${before}${inserted}${after}`

    onChange(nextValue)
    if (!mentionedUsers.some((u) => u.id === profile.id) && mentionedUsers.length < MAX_MENTIONS) {
      const mention: CommentMention = {
        id: profile.id,
        display_name: profile.display_name,
        display_slug: profile.display_slug,
        avatar_url: profile.avatar_url,
      }
      onMentionedUsersChange([...mentionedUsers, mention])
    }
    setSuggestions([])
    setSearchStatus("idle")
    setMentionRange(null)

    requestAnimationFrame(() => {
      const nextCursor = before.length + inserted.length
      textarea.focus()
      textarea.setSelectionRange(nextCursor, nextCursor)
    })
  }

  function removeMention(userId: string) {
    onMentionedUsersChange(mentionedUsers.filter((u) => u.id !== userId))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || suggestions.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      selectMention(suggestions[activeIndex])
    } else if (e.key === "Escape") {
      setMentionRange(null)
    }
  }

  const showPanel = open && !mentionLimitReached

  return (
    <div className="space-y-1.5">
      {mentionedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mentionedUsers.map((user) => (
            <span
              key={user.id}
              className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-1 pr-2 text-xs font-medium text-primary"
            >
              <UserAvatar name={user.display_name} avatarUrl={user.avatar_url} size={4} />
              {user.display_name}
              <button
                type="button"
                onClick={() => removeMention(user.id)}
                className="ml-0.5 rounded-full text-primary/70 transition-colors hover:text-destructive"
                aria-label={`Remover menção a ${user.display_name}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <textarea
          ref={textareaRef}
          autoFocus={autoFocus}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setMentionRange(null), 150)}
          className={cn(
            "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30",
            className
          )}
          placeholder={placeholder}
        />

        {showPanel && (
          <div className="absolute left-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            {currentQuery.length < MIN_QUERY_LENGTH ? (
              <p className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                <AtSign className="size-3.5 shrink-0" />
                Digite mais {MIN_QUERY_LENGTH - currentQuery.length} letra
                {MIN_QUERY_LENGTH - currentQuery.length > 1 ? "s" : ""} para buscar…
              </p>
            ) : searchStatus !== "done" ? (
              <p className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
                Buscando &ldquo;{currentQuery}&rdquo;…
              </p>
            ) : suggestions.length > 0 ? (
              <div className="max-h-56 overflow-y-auto py-1">
                {suggestions.map((profile, index) => (
                  <button
                    key={profile.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectMention(profile)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      index === activeIndex ? "bg-primary/10 text-primary" : "hover:bg-muted/60"
                    }`}
                  >
                    <UserAvatar name={profile.display_name} avatarUrl={profile.avatar_url} size={6} />
                    <span className="truncate font-medium">{profile.display_name}</span>
                  </button>
                ))}
              </div>
            ) : searchStatus === "done" ? (
              <p className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                <AtSign className="size-3.5 shrink-0" />
                Nenhum usuário encontrado para &ldquo;{currentQuery}&rdquo;.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {mentionLimitReached && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AtSign className="size-3 shrink-0" />
          Limite de {MAX_MENTIONS} menções por comentário.
        </p>
      )}
    </div>
  )
}
