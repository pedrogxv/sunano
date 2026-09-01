"use client"

import { Check, Handshake } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { buildAffiliateLink } from "@/lib/affiliate-code"
import { useAffiliateCode } from "@/lib/hooks/use-affiliate-code"
import { SITE_URL } from "@/lib/site-url"
import { cn } from "@/lib/utils"

/**
 * "Copiar link de afiliado": copia a URL da página atual já com `?ref=SEUCODIGO`,
 * pronta para mandar para outra pessoa — a compra dela dentro de 30 dias conta
 * como indicação sua.
 *
 * Renderiza `null` para quem não é afiliado aprovado: a tela de quem não
 * participa do programa fica exatamente como era.
 *
 * Por padrão usa o caminho da página em que está montado; passe `path` para
 * fixar um destino (ex.: um produto específico numa listagem).
 */
export function AffiliateShareButton({
  path,
  className,
  label = "Copiar link de afiliado",
}: {
  path?: string
  className?: string
  label?: string
}) {
  const { code } = useAffiliateCode()
  const [copied, setCopied] = useState(false)

  if (!code) return null

  async function handleCopy() {
    // Caminho lido de `window.location` em vez de `useSearchParams`: o hook
    // obriga a página inteira a virar dinâmica (ou a ganhar um Suspense), e a
    // página de produto é estática com `revalidate`. Aqui a URL só importa no
    // clique, que sempre acontece no browser.
    const currentPath = path ?? `${window.location.pathname}${window.location.search}`
    // `code` está garantido pelo early-return acima; o TS não carrega essa
    // informação para dentro do handler.
    const link = buildAffiliateLink(SITE_URL, code!, currentPath)
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success("Link de afiliado copiado!", {
        description: "Quem comprar por esse link nos próximos 30 dias gera comissão para você.",
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Não foi possível copiar o link")
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/10",
        className
      )}
    >
      {copied ? <Check className="size-4 shrink-0" /> : <Handshake className="size-4 shrink-0" />}
      {copied ? "Link copiado!" : label}
    </button>
  )
}
