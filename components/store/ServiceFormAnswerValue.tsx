import { safeHref } from "@/lib/safe-url"
import { isHttpUrl, type ServiceFormAnswer } from "@/lib/store-service-form"

/**
 * Valor de uma resposta do formulário de serviço, igual em Meus Pedidos e na
 * fila do admin: foto vira miniatura (a URL já chega re-assinada da leitura),
 * link vira link, o resto é texto.
 */
export function ServiceFormAnswerValue({ answer }: { answer: ServiceFormAnswer }) {
  if (answer.type === "image") {
    const urls = answer.items ?? []
    if (urls.length === 0) return <span className="text-muted-foreground">Foto indisponível</span>
    return (
      <span className="mt-1 flex flex-wrap gap-1.5">
        {urls.map((url) => (
          <a key={url} href={safeHref(url)} target="_blank" rel="noopener noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={answer.label}
              className="size-16 rounded-md border border-border object-cover transition-opacity hover:opacity-80"
            />
          </a>
        ))}
      </span>
    )
  }
  if (isHttpUrl(answer.value)) {
    return (
      <a
        href={safeHref(answer.value)}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-sky-400 underline-offset-2 hover:underline"
      >
        {answer.value}
      </a>
    )
  }
  return <>{answer.value}</>
}
