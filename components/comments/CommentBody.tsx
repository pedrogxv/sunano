import { Fragment } from "react"
import Link from "next/link"

import { MiniProfileHoverCard } from "@/components/profile/MiniProfileHoverCard"
import { parseTextMarkdown } from "@/lib/comment-markdown"
import { profilePath } from "@/lib/profile-name"
import { cn } from "@/lib/utils"
import type { CommentMention } from "./types"

/**
 * Quebra um trecho de texto simples (já sem negrito/itálico) em pedaços,
 * destacando "@Nome Exibido" quando esse nome bate com um dos `mentions` do
 * comentário — a lista de quem foi de fato @mencionado, resolvida no
 * servidor (ver `ForumCommentDetail`/`BlogCommentDetail`). Casar pelo nome
 * em vez de guardar um marcador tipo `@[nome](id)` no corpo evita mudar o
 * formato salvo no banco: o texto continua cru, igual ao `**negrito**`.
 */
function splitMentions(text: string, mentions: CommentMention[]) {
  if (mentions.length === 0) return [{ text, mention: null as CommentMention | null }]

  // Nomes mais longos primeiro — evita que "Ana" case dentro de "Ana Paula"
  // e deixe "Paula" sobrando como texto solto.
  const sorted = [...mentions].sort((a, b) => b.display_name.length - a.display_name.length)
  const pattern = new RegExp(
    `@(${sorted.map((m) => m.display_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=\\s|$)`,
    "g"
  )

  const parts: { text: string; mention: CommentMention | null }[] = []
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > cursor) parts.push({ text: text.slice(cursor, start), mention: null })
    const mention = sorted.find((m) => m.display_name === match[1]) ?? null
    parts.push({ text: match[0], mention })
    cursor = start + match[0].length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), mention: null })
  return parts
}

/** "@Nome" destacado — some para link do perfil + Mini Perfil ao passar o cursor, texto puro senão. */
function MentionChip({ mention, text }: { mention: CommentMention | null; text: string }) {
  if (!mention) return <>{text}</>
  if (!mention.display_slug) {
    return <span className="font-medium text-primary">{text}</span>
  }
  return (
    <MiniProfileHoverCard slug={mention.display_slug} side="top" align="start">
      <Link
        href={profilePath(mention.display_slug)}
        className="rounded font-medium text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:bg-primary/10 hover:decoration-primary"
      >
        {text}
      </Link>
    </MiniProfileHoverCard>
  )
}

/**
 * Corpo do comentário com o markdown mínimo aplicado (`**negrito**`, `*itálico*`)
 * e as @menções destacadas como link para o perfil (com Mini Perfil ao
 * passar o cursor).
 *
 * Os trechos vêm de `parseTextMarkdown` como texto puro e viram elementos
 * React aqui — nada de `dangerouslySetInnerHTML`, então o React escapa o que
 * o usuário escreveu e não há HTML para sanitizar. Um comentário com
 * `<img onerror=...>` continua sendo exibido como texto literal.
 */
export function CommentBody({
  body,
  mentions = [],
  className = "",
}: {
  body: string
  mentions?: CommentMention[]
  className?: string
}) {
  return (
    <p className={cn("whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground", className)}>
      {parseTextMarkdown(body).map((segment, index) => {
        if (segment.href) {
          return (
            <a
              key={index}
              href={segment.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
            >
              {segment.text}
            </a>
          )
        }
        if (segment.bold) {
          return (
            <strong key={index} className="font-semibold">
              {segment.text}
            </strong>
          )
        }
        if (segment.italic) {
          return <em key={index}>{segment.text}</em>
        }
        if (segment.underline) {
          return <u key={index}>{segment.text}</u>
        }
        return (
          <Fragment key={index}>
            {splitMentions(segment.text, mentions).map((part, partIndex) => (
              <MentionChip key={partIndex} mention={part.mention} text={part.text} />
            ))}
          </Fragment>
        )
      })}
    </p>
  )
}
