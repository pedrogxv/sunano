"use client"

import { useEffect, useRef, useState } from "react"
import { toPng } from "html-to-image"
import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { PersonalTierlistExportView } from "./PersonalTierlistExportView"
import type { TierlistItem, TierlistTierDef } from "@/lib/personal-tierlist"

/** Nome do arquivo baixado — sem acento nem símbolo, que nem todo sistema aceita. */
function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "sunano"
}

/**
 * Botão "Baixar imagem" — monta `PersonalTierlistExportView` fora da tela só
 * na hora do clique (evita carregar toda imagem em `priority` sem
 * necessidade) e captura com `html-to-image`, que baixa cada imagem por conta
 * própria e a embute como data URL, sem depender de o `<img>` da tela já ter
 * carregado. Sem marca d'água de propósito — só o board.
 */
export function PersonalTierlistExportButton({
  ownerName,
  tiers,
  items,
}: {
  ownerName: string
  tiers: TierlistTierDef[]
  items: TierlistItem[]
}) {
  const [exporting, setExporting] = useState(false)
  const nodeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exporting) return

    const node = nodeRef.current
    // Sem o nó não há o que capturar — mas o botão precisa voltar ao normal,
    // senão fica travado em "Gerando..." pra sempre.
    if (!node) {
      setExporting(false)
      toast.error("Não foi possível gerar a imagem.")
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const dataUrl = await toPng(node, {
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor: "#0B0D12",
          // O board de exportação declara `system-ui` no próprio style, então
          // não há webfont pra embutir — pular a varredura das folhas de
          // estilo evita baixar fonte à toa (e falhar por causa disso).
          skipFonts: true,
          // Imagem que não puder ser embutida vira um pixel transparente em
          // vez do ícone de imagem quebrada.
          imagePlaceholder:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        })
        if (cancelled) return

        const link = document.createElement("a")
        link.href = dataUrl
        link.download = `tierlist-${slugify(ownerName)}.png`
        document.body.appendChild(link)
        link.click()
        link.remove()
      } catch (err) {
        console.error("[tierlist export]", err)
        if (!cancelled) toast.error("Não foi possível gerar a imagem.")
      } finally {
        if (!cancelled) setExporting(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [exporting, ownerName])

  return (
    <>
      <button
        type="button"
        disabled={exporting}
        onClick={() => setExporting(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
      >
        {exporting ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <Download className="size-3.5 shrink-0" />
        )}
        <span className="hidden sm:inline">{exporting ? "Gerando..." : "Baixar imagem"}</span>
      </button>

      {exporting && (
        <div style={{ position: "fixed", left: -9999, top: 0, zIndex: -1 }} aria-hidden>
          <div ref={nodeRef}>
            <PersonalTierlistExportView ownerName={ownerName} tiers={tiers} items={items} />
          </div>
        </div>
      )}
    </>
  )
}
