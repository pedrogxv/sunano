import { Fragment } from "react"

import { parseTextMarkdown } from "@/lib/comment-markdown"

/**
 * Aplica o markdown mínimo (`**negrito**`, `*itálico*`, `__sublinhado__`,
 * `==destaque==`, `[texto](url)`) sem a lógica de @menções do `CommentBody`
 * — pra textos fora do fórum/comentários, como a descrição de produto.
 */
export function FormattedText({ text }: { text: string }) {
  return (
    <>
      {parseTextMarkdown(text).map((segment, index) => {
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
        if (segment.highlight) {
          return (
            <mark key={index} className="rounded bg-primary/25 px-0.5 text-foreground">
              {segment.text}
            </mark>
          )
        }
        return <Fragment key={index}>{segment.text}</Fragment>
      })}
    </>
  )
}
