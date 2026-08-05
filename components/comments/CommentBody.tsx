import { Fragment } from "react"

import { parseCommentMarkdown } from "@/lib/comment-markdown"

/**
 * Corpo do comentário com o markdown mínimo aplicado (só `**negrito**`).
 *
 * Os trechos vêm de `parseCommentMarkdown` como texto puro e viram elementos
 * React aqui — nada de `dangerouslySetInnerHTML`, então o React escapa o que
 * o usuário escreveu e não há HTML para sanitizar. Um comentário com
 * `<img onerror=...>` continua sendo exibido como texto literal.
 */
export function CommentBody({ body, className = "" }: { body: string; className?: string }) {
  return (
    <p className={`whitespace-pre-wrap text-sm leading-relaxed text-foreground ${className}`}>
      {parseCommentMarkdown(body).map((segment, index) =>
        segment.bold ? (
          <strong key={index} className="font-semibold">
            {segment.text}
          </strong>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        )
      )}
    </p>
  )
}

/** Dica de formatação exibida sob os campos de texto de comentário/resposta. */
export function CommentFormatHint() {
  return (
    <p className="text-xs text-muted-foreground">
      Use <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">**texto**</code> para
      negrito.
    </p>
  )
}
