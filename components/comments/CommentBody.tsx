import { Fragment } from "react"

import { parseTextMarkdown } from "@/lib/comment-markdown"
import { cn } from "@/lib/utils"

/**
 * Corpo do comentário com o markdown mínimo aplicado (`**negrito**`, `*itálico*`).
 *
 * Os trechos vêm de `parseTextMarkdown` como texto puro e viram elementos
 * React aqui — nada de `dangerouslySetInnerHTML`, então o React escapa o que
 * o usuário escreveu e não há HTML para sanitizar. Um comentário com
 * `<img onerror=...>` continua sendo exibido como texto literal.
 */
export function CommentBody({ body, className = "" }: { body: string; className?: string }) {
  return (
    <p className={cn("whitespace-pre-wrap text-sm leading-relaxed text-foreground", className)}>
      {parseTextMarkdown(body).map((segment, index) => {
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
        return <Fragment key={index}>{segment.text}</Fragment>
      })}
    </p>
  )
}

/** Dica de formatação exibida sob os campos de texto de comentário/resposta. */
export function CommentFormatHint() {
  return (
    <p className="text-xs text-muted-foreground">
      Use <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">**texto**</code> para
      negrito e <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">*texto*</code> para
      itálico.
    </p>
  )
}
