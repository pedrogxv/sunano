"use client"

import { useState } from "react"
import { Check, Copy, Share2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { REFERRAL_REWARD_DIRECT } from "@/lib/referral-code"

/**
 * Caixa do link + cupom. É a única coisa que a pessoa precisa levar embora da
 * página, então fica no topo e os dois formatos aparecem juntos: o link (para
 * mandar no WhatsApp/Discord) e o cupom solto (para ditar num vídeo ou numa
 * conversa, onde link não funciona).
 */
export function ReferralLinkBox({ link, code }: { link: string; code: string }) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null)

  async function copy(value: string, kind: "link" | "code") {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      toast.success(kind === "link" ? "Link copiado!" : "Cupom copiado!", {
        description: `Quem se cadastrar por aqui vale ${REFERRAL_REWARD_DIRECT} de Aura pra você.`,
      })
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error("Não foi possível copiar")
    }
  }

  async function share() {
    // Web Share API only existe em navegador com suporte (mobile, em geral).
    // Sem ela, cai no copiar — que funciona em todo lugar.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Entra na Sunano comigo",
          text: `Usa meu cupom ${code} pra se cadastrar na Sunano!`,
          url: link,
        })
        return
      } catch {
        // Cancelou o compartilhamento — não é erro.
        return
      }
    }
    await copy(link, "link")
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Seu link
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2.5 text-sm">
            {link}
          </code>
          <div className="flex gap-2">
            <Button onClick={() => copy(link, "link")} className="gap-2" type="button">
              {copied === "link" ? <Check className="size-4" /> : <Copy className="size-4" />}
              Copiar
            </Button>
            <Button onClick={share} variant="outline" className="gap-2" type="button">
              <Share2 className="size-4" />
              <span className="sr-only sm:not-sr-only">Compartilhar</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Seu cupom
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => copy(code, "code")}
            className="group flex items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/[0.04] px-4 py-2.5 transition-colors hover:bg-primary/10"
          >
            <span className="font-mono text-lg font-semibold tracking-widest text-foreground">
              {code}
            </span>
            {copied === "code" ? (
              <Check className="size-4 text-green-500" />
            ) : (
              <Copy className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            )}
          </button>
          <p className="text-xs text-muted-foreground">
            Serve para quem prefere digitar o cupom na hora de criar a conta.
          </p>
        </div>
      </div>
    </div>
  )
}
