"use client"

import Image from "next/image"
import { useState } from "react"
import { Check, Copy, QrCode } from "lucide-react"
import { toast } from "sonner"

export interface VipPixPayment {
  id: string
  qrCodeBase64: string
  copyPaste: string
  expiresAt: string
  amountCents: number
}

interface VipPixChargeProps {
  payment: VipPixPayment
  /** `true` = 1ª cobrança (ainda não é assinante); muda só o texto de apoio. */
  isFirstCharge?: boolean
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDueDate(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/**
 * QR code da cobrança PIX do ciclo atual da assinatura VIP.
 *
 * Diferente do PIX da loja, este NÃO tem contagem regressiva de minutos: a
 * cobrança de uma assinatura vale até o vencimento do ciclo (não segura
 * estoque nenhum), então um cronômetro de "expira em 59:12" seria mentira e
 * criaria urgência falsa. Ver `getPixQrCode({ clampToOrderWindow: false })`.
 */
export function VipPixCharge({ payment, isFirstCharge = false }: VipPixChargeProps) {
  const [copied, setCopied] = useState(false)
  const dueDate = formatDueDate(payment.expiresAt)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(payment.copyPaste)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Não foi possível copiar", { description: "Copie o código manualmente." })
    }
  }

  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-4">
      <div className="flex items-start gap-2">
        <QrCode className="mt-0.5 size-4 shrink-0" style={{ color: "var(--vip-accent)" }} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            {isFirstCharge ? "Pague o primeiro mês" : "Cobrança deste mês"} ·{" "}
            {formatBRL(payment.amountCents)}
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {isFirstCharge
              ? "Seu VIP é liberado assim que o pagamento for confirmado."
              : "Pague para manter o VIP ativo no próximo ciclo."}
            {dueDate ? ` Vence em ${dueDate}.` : ""}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="shrink-0 rounded-lg bg-white p-2">
          <Image
            src={payment.qrCodeBase64}
            alt="QR code PIX da assinatura VIP"
            width={160}
            height={160}
            className="size-40"
            unoptimized
          />
        </div>

        <div className="w-full min-w-0 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            PIX copia e cola
          </p>
          <p className="max-h-16 overflow-y-auto break-all rounded-lg border border-border/60 bg-muted/30 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
            {payment.copyPaste}
          </p>
          <button
            type="button"
            onClick={handleCopy}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-black transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--vip-accent)" }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Código copiado" : "Copiar código PIX"}
          </button>
          <p className="text-[10px] leading-relaxed text-muted-foreground/70">
            A confirmação costuma levar poucos segundos. Esta página se atualiza sozinha.
          </p>
        </div>
      </div>
    </div>
  )
}
