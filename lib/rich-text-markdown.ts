/**
 * Ponte pura (sem React) entre o dialeto de `lib/comment-markdown.ts` e o DOM
 * de um `contenteditable` — usado por `components/ui/rich-text-editor.tsx`.
 * Fica em `lib/` (não dentro do componente) pra poder testar a manipulação
 * de `Range`/DOM isolada, sem montar React/Radix.
 *
 * O dialeto não suporta estilos combinados (negrito+itálico etc. — ver
 * comentário em `parseTextMarkdown`), então aplicar um formato novo sempre
 * troca o anterior no trecho selecionado em vez de aninhar.
 */

import { parseTextMarkdown, type TextSegment } from "@/lib/comment-markdown"

export const ZWSP = "​"

export type FormatTag = "strong" | "em" | "u" | "mark"

const FORMAT_TAGS = new Set(["STRONG", "B", "EM", "I", "U", "MARK", "A"])

const FORMAT_CLASS: Record<string, string> = {
  strong: "font-semibold",
  mark: "rounded bg-primary/25 px-0.5 text-foreground",
  a: "text-sky-400 underline decoration-sky-400/40 underline-offset-2",
}

export function createFormatElement(tag: FormatTag | "a"): HTMLElement {
  const el = document.createElement(tag)
  if (FORMAT_CLASS[tag]) el.className = FORMAT_CLASS[tag]
  return el
}

function segmentToNode(segment: TextSegment): Node {
  const text = document.createTextNode(segment.text)
  if (segment.href) {
    const a = createFormatElement("a") as HTMLAnchorElement
    a.href = segment.href
    a.appendChild(text)
    return a
  }
  if (segment.bold) {
    const el = createFormatElement("strong")
    el.appendChild(text)
    return el
  }
  if (segment.italic) {
    const el = createFormatElement("em")
    el.appendChild(text)
    return el
  }
  if (segment.underline) {
    const el = createFormatElement("u")
    el.appendChild(text)
    return el
  }
  if (segment.highlight) {
    const el = createFormatElement("mark")
    el.appendChild(text)
    return el
  }
  return text
}

/** Reconstrói o DOM do editor a partir da string com marcadores (carregar/trocar item). */
export function markdownToNodes(markdown: string): Node[] {
  const nodes: Node[] = []
  const lines = markdown.split("\n")
  lines.forEach((line, index) => {
    for (const segment of parseTextMarkdown(line)) {
      if (!segment.text) continue
      nodes.push(segmentToNode(segment))
    }
    if (index < lines.length - 1) nodes.push(document.createElement("br"))
  })
  return nodes
}

/** Inverso de `markdownToNodes` — roda a cada tecla, pra devolver `onChange(markdown)`. */
function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replaceAll(ZWSP, "")
  const el = node as HTMLElement
  if (el.tagName === "BR") return "\n"

  const inner = Array.from(el.childNodes).map(serializeNode).join("")
  if (!inner) return ""

  switch (el.tagName) {
    case "STRONG":
    case "B":
      return `**${inner}**`
    case "EM":
    case "I":
      return `*${inner}*`
    case "U":
      return `__${inner}__`
    case "MARK":
      return `==${inner}==`
    case "A": {
      const href = el.getAttribute("href") ?? ""
      return href ? `[${inner}](${href})` : inner
    }
    default:
      return inner
  }
}

export function serializeEditor(root: HTMLElement): string {
  return Array.from(root.childNodes).map(serializeNode).join("")
}

/** Remove negrito/itálico/sublinhado/destaque/link de dentro de um fragmento — usado antes de aplicar um formato novo, pra nunca aninhar dois estilos que o dialeto não sabe representar juntos. */
export function stripFormattingTags(root: DocumentFragment | HTMLElement) {
  const toUnwrap: HTMLElement[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let node = walker.nextNode() as HTMLElement | null
  while (node) {
    if (FORMAT_TAGS.has(node.tagName)) toUnwrap.push(node)
    node = walker.nextNode() as HTMLElement | null
  }
  for (const el of toUnwrap) {
    const parent = el.parentNode
    if (!parent) continue
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  }
}

export function closestFormatAncestor(node: Node, root: HTMLElement, tag: string): HTMLElement | null {
  let current: Node | null = node
  while (current && current !== root) {
    if (current.nodeType === Node.ELEMENT_NODE && (current as HTMLElement).tagName === tag) {
      return current as HTMLElement
    }
    current = current.parentNode
  }
  return null
}

function closestAnyFormatAncestor(node: Node, root: HTMLElement): HTMLElement | null {
  let current: Node | null = node
  while (current && current !== root) {
    if (current.nodeType === Node.ELEMENT_NODE && FORMAT_TAGS.has((current as HTMLElement).tagName)) {
      return current as HTMLElement
    }
    current = current.parentNode
  }
  return null
}

/**
 * Aplica/alterna negrito, itálico, sublinhado ou destaque no `range` dado.
 * Devolve o range a reselecionar (dentro do trecho recém-formatado, ou no
 * cursor pronto pra digitar quando a seleção estava colapsada).
 */
export function toggleInlineFormat(range: Range, tag: FormatTag, editorRoot: HTMLElement): Range {
  if (range.collapsed) {
    const el = createFormatElement(tag)
    const textNode = document.createTextNode(ZWSP)
    el.appendChild(textNode)
    range.insertNode(el)
    const newRange = document.createRange()
    newRange.setStart(textNode, 1)
    newRange.collapse(true)
    return newRange
  }

  const selectedText = range.toString()
  const ancestor = closestFormatAncestor(range.commonAncestorContainer, editorRoot, tag.toUpperCase())
  if (ancestor && ancestor.textContent === selectedText) {
    const parent = ancestor.parentNode
    const newRange = document.createRange()
    if (parent) {
      const first = ancestor.firstChild
      const last = ancestor.lastChild
      while (ancestor.firstChild) parent.insertBefore(ancestor.firstChild, ancestor)
      parent.removeChild(ancestor)
      if (first && last) {
        newRange.setStartBefore(first)
        newRange.setEndAfter(last)
      }
    }
    return newRange
  }

  // A seleção pode estar total ou parcialmente DENTRO de um formato diferente
  // (ex: reselecionar um trecho já em negrito pra deixar itálico) — expande
  // pro alcance inteiro desse marcador antes de extrair, senão `extractContents`
  // só pega o texto de dentro e o `<strong>`/`<em>`/etc. original fica pra trás,
  // vazio ou aninhando o formato novo por fora. O dialeto não representa dois
  // estilos combinados (ver topo do arquivo), então aqui sempre troca.
  const workingRange = range.cloneRange()
  const startAncestor = closestAnyFormatAncestor(workingRange.startContainer, editorRoot)
  if (startAncestor) workingRange.setStartBefore(startAncestor)
  const endAncestor = closestAnyFormatAncestor(workingRange.endContainer, editorRoot)
  if (endAncestor) workingRange.setEndAfter(endAncestor)

  const fragment = workingRange.extractContents()
  stripFormattingTags(fragment)
  const wrapper = createFormatElement(tag)
  wrapper.appendChild(fragment)
  workingRange.insertNode(wrapper)
  const newRange = document.createRange()
  newRange.selectNodeContents(wrapper)
  return newRange
}

/** Envolve (ou insere, sem seleção) o `range` num link pra `href`. Devolve o cursor logo depois do link. */
export function insertOrWrapLink(range: Range, href: string): Range {
  const a = createFormatElement("a") as HTMLAnchorElement
  a.href = href

  if (range.collapsed) {
    a.appendChild(document.createTextNode(href))
  } else {
    const fragment = range.extractContents()
    stripFormattingTags(fragment)
    a.appendChild(fragment)
  }
  range.insertNode(a)

  const newRange = document.createRange()
  newRange.setStartAfter(a)
  newRange.collapse(true)
  return newRange
}

/** Quebra de linha manual (Enter) — sempre `<br>`, nunca um novo bloco, pra manter a serialização plana. */
export function insertLineBreak(range: Range): Range {
  range.deleteContents()
  const br = document.createElement("br")
  range.insertNode(br)
  const newRange = document.createRange()
  newRange.setStartAfter(br)
  newRange.collapse(true)
  return newRange
}

/** Cola texto puro linha a linha (`<br>` entre elas) — nunca HTML de fora, pra não trazer formatação que o dialeto não representa. */
export function insertPlainTextMultiline(range: Range, text: string): Range {
  range.deleteContents()
  const lines = text.split("\n")
  let workingRange = range
  lines.forEach((line, index) => {
    if (index > 0) {
      const br = document.createElement("br")
      workingRange.insertNode(br)
      const afterBr = document.createRange()
      afterBr.setStartAfter(br)
      afterBr.collapse(true)
      workingRange = afterBr
    }
    if (line) {
      const textNode = document.createTextNode(line)
      workingRange.insertNode(textNode)
      const afterText = document.createRange()
      afterText.setStartAfter(textNode)
      afterText.collapse(true)
      workingRange = afterText
    }
  })
  workingRange.collapse(true)
  return workingRange
}
