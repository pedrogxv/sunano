"use client"

import type { SVGProps } from "react"
import { Code2, Link2, MoreHorizontal, Share2 } from "lucide-react"
import { toast } from "sonner"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H15.53l-5.214-6.817L4.32 21.75H1.011l7.727-8.835L.622 2.25H8.08l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117Z" />
    </svg>
  )
}

function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-1.746-.873-2.888-1.556-4.035-3.53-.305-.526.305-.489.874-1.629.098-.198.049-.371-.05-.52-.099-.148-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.017-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.148.198 2.05 3.126 4.966 4.26 2.916 1.133 2.916.755 3.86.68.943-.075 3.06-1.252 3.485-2.454.425-1.202.425-2.23.297-2.454-.128-.223-.297-.198-.594-.347Z" />
      <path d="M12.043 2.003c-5.517 0-9.986 4.47-9.986 9.986 0 1.769.462 3.483 1.343 4.986L2 22l5.121-1.343a9.937 9.937 0 0 0 4.922 1.323h.004c5.517 0 9.986-4.47 9.986-9.986 0-2.667-1.039-5.176-2.926-7.063a9.935 9.935 0 0 0-7.064-2.928Zm0 18.14a8.14 8.14 0 0 1-4.166-1.14l-.299-.178-3.077.807.822-3.001-.195-.309a8.14 8.14 0 0 1-1.243-4.332c0-4.502 3.664-8.166 8.166-8.166a8.14 8.14 0 0 1 5.775 2.393 8.107 8.107 0 0 1 2.386 5.777c-.002 4.502-3.666 8.149-8.169 8.149Z" />
    </svg>
  )
}

function buildShareText(title: string): string {
  return title.length > 140 ? `${title.slice(0, 137)}...` : title
}

const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function"

/**
 * Menu de compartilhar de um post (estilo Reddit): copiar link, incorporar
 * (placeholder), X, WhatsApp e — quando o browser/dispositivo suporta — a
 * Web Share API nativa via "Mais opções".
 */
export function ShareMenu({ slug, title }: { slug: string; title: string }) {
  function getUrl() {
    return `${window.location.origin}/forum/${slug}`
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(getUrl())
      toast.success("Link copiado!")
    } catch {
      toast.error("Não foi possível copiar o link")
    }
  }

  function handleEmbed() {
    toast("Incorporar posts chega em breve.")
  }

  function handleShareX() {
    const params = new URLSearchParams({ text: buildShareText(title), url: getUrl() })
    window.open(`https://twitter.com/intent/tweet?${params.toString()}`, "_blank", "noopener,noreferrer")
  }

  function handleShareWhatsApp() {
    const params = new URLSearchParams({ text: `${buildShareText(title)} ${getUrl()}` })
    window.open(`https://wa.me/?${params.toString()}`, "_blank", "noopener,noreferrer")
  }

  async function handleNativeShare() {
    try {
      await navigator.share({ url: getUrl(), text: buildShareText(title) })
    } catch {
      // usuário cancelou o compartilhamento — nada a fazer
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Share2 className="size-3.5 shrink-0" />
          <span className="hidden sm:inline">Compartilhar</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 border-border bg-popover text-foreground shadow-xl">
        <DropdownMenuItem onSelect={handleCopyLink} className="gap-2.5">
          <Link2 className="size-4" />
          Copiar link
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleEmbed} className="gap-2.5 text-muted-foreground">
          <Code2 className="size-4" />
          Incorporar
          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground/70">em breve</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleShareX} className="gap-2.5">
          <XIcon className="size-4" />
          X
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleShareWhatsApp} className="gap-2.5">
          <WhatsAppIcon className="size-4 text-[#25D366]" />
          WhatsApp
        </DropdownMenuItem>
        {canNativeShare && (
          <DropdownMenuItem onSelect={handleNativeShare} className="gap-2.5">
            <MoreHorizontal className="size-4" />
            Mais opções
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
