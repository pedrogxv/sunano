import { Fragment } from "react"

import { SmartLink } from "@/components/ui/smart-link"
import { parseTextLines, type TextSegment } from "@/lib/comment-markdown"

/** Monta os elementos inline (negrito/itálico/sublinhado/destaque/link) de uma linha já parseada. */
export function renderTextSegments(segments: TextSegment[]) {
  return segments.map((segment, index) => {
    if (segment.href) {
      return (
        <SmartLink key={index} href={segment.href}>
          {segment.text}
        </SmartLink>
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
  })
}

function isBlankLine(line: ReturnType<typeof parseTextLines>[number]) {
  return !line.bullet && !line.heading && line.segments.every((segment) => !segment.text.trim())
}

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: "text-xl font-semibold",
  2: "text-lg font-semibold",
  3: "text-base font-semibold",
}

/**
 * Aplica o markdown mínimo (`**negrito**`, `*itálico*`, `__sublinhado__`,
 * `==destaque==`, `[texto](url)`, `- item` para lista, `#`/`##`/`###` para
 * título) sem a lógica de @menções do `CommentBody` — pra textos fora do
 * fórum/comentários, como a descrição de produto.
 *
 * `paragraphs`: linha em branco separa PARÁGRAFO (`<p>` com margem), em vez de
 * virar uma linha vazia inteira sob `pre-wrap`. Com o modo antigo, cada
 * Enter duplo no admin abria um buraco do tamanho de uma linha de texto — e
 * dois ou três Enters seguidos, um buraco maior ainda. O container NÃO deve
 * ter `whitespace-pre-wrap` nesse modo (as quebras simples saem como `<br>`).
 */
export function FormattedText({ text, paragraphs = false }: { text: string; paragraphs?: boolean }) {
  // Quebra no começo/fim do texto só empurra o card (com `pre-wrap` ela vira espaço).
  const lines = parseTextLines(text.replace(/^[\r\n]+|[\r\n]+$/g, ""))

  const blocks: { bullet: boolean; heading: 1 | 2 | 3 | null; lines: (typeof lines)[number][] }[] = []
  for (const line of lines) {
    if (paragraphs && isBlankLine(line)) {
      // Linha vazia fecha o bloco atual; várias seguidas contam como uma só.
      if (blocks.length > 0 && blocks[blocks.length - 1].lines.length > 0) {
        blocks.push({ bullet: false, heading: null, lines: [] })
      }
      continue
    }
    const last = blocks[blocks.length - 1]
    if (paragraphs && last && last.lines.length === 0) {
      last.bullet = line.bullet
      last.heading = line.heading
      last.lines.push(line)
      continue
    }
    if (last && last.bullet === line.bullet && last.heading === line.heading && !line.heading) {
      last.lines.push(line)
    } else {
      blocks.push({ bullet: line.bullet, heading: line.heading, lines: [line] })
    }
  }

  return (
    <>
      {blocks.map((block, blockIndex) => {
        if (block.heading) {
          const HeadingTag = (`h${block.heading}` as const) as "h1" | "h2" | "h3"
          return (
            <HeadingTag key={blockIndex} className={HEADING_CLASS[block.heading]}>
              {renderTextSegments(block.lines[0].segments)}
            </HeadingTag>
          )
        }
        if (block.bullet) {
          return (
            <ul key={blockIndex} className="my-1 space-y-1">
              {block.lines.map((line, lineIndex) => (
                <li key={lineIndex} className="flex gap-2">
                  <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{renderTextSegments(line.segments)}</span>
                </li>
              ))}
            </ul>
          )
        }
        if (paragraphs) {
          if (block.lines.length === 0) return null
          return (
            <p key={blockIndex}>
              {block.lines.map((line, lineIndex) => (
                <Fragment key={lineIndex}>
                  {lineIndex > 0 && <br />}
                  {renderTextSegments(line.segments)}
                </Fragment>
              ))}
            </p>
          )
        }
        return (
          <Fragment key={blockIndex}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && "\n"}
                {renderTextSegments(line.segments)}
              </Fragment>
            ))}
          </Fragment>
        )
      })}
    </>
  )
}
