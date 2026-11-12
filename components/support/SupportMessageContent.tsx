"use client"

import { MediaViewer } from "@/components/ui/media-viewer"
import { cn } from "@/lib/utils"

/**
 * Corpo e anexos de uma mensagem de chamado: o mesmo desenho na conversa do
 * membro (`SupportMessageList`) e na tela da equipe (`/admin/suporte/[id]`).
 */

/** Pontuação que encosta no fim de um link numa frase ("veja https://x.com."). */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/

/**
 * Texto da mensagem com os links clicáveis. Só `http(s)://` vira link: o texto
 * é de quem escreveu a mensagem, e um esquema livre deixaria um
 * `javascript:` passar para o `href`.
 */
export function SupportMessageBody({ body, className }: { body: string; className?: string }) {
  const parts = body.split(/(https?:\/\/[^\s<>]+)/g)
  return (
    <p className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((part, index) => {
        if (index % 2 === 0) return part
        const trailing = part.match(TRAILING_PUNCTUATION)?.[0] ?? ""
        const url = trailing ? part.slice(0, -trailing.length) : part
        return (
          <span key={index}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener nofollow"
              className="break-all underline underline-offset-2 transition-opacity hover:opacity-80"
            >
              {url}
            </a>
            {trailing}
          </span>
        )
      })}
    </p>
  )
}

/**
 * Anexos da mensagem. O clique abre o visualizador na própria página (zoom,
 * arraste e navegação entre as fotos da mensagem) em vez de uma aba nova.
 */
export function SupportMessageImages({
  urls,
  thumbClassName = "size-20 sm:size-24",
  triggerClassName,
}: {
  urls: string[]
  thumbClassName?: string
  triggerClassName?: string
}) {
  if (urls.length === 0) return null
  const items = urls.map((src, index) => ({
    src,
    alt: urls.length > 1 ? `Anexo ${index + 1} de ${urls.length}` : "Anexo",
    // URL assinada do Storage privado: passa direto, sem o loader de miniatura.
    unoptimized: true,
  }))
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {urls.map((url, index) => (
        <MediaViewer
          key={url}
          items={items}
          index={index}
          hintPosition="center"
          triggerClassName={cn("overflow-hidden rounded-lg transition-opacity hover:opacity-80", triggerClassName)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Anexo" className={cn("object-cover", thumbClassName)} loading="lazy" decoding="async" />
        </MediaViewer>
      ))}
    </div>
  )
}
