"use client"

import { useEffect, useMemo, useState } from "react"

import { cn } from "@/lib/utils"

/** Abaixo disso o contador entra em estado de urgência (vermelho, pulsando). */
const URGENT_THRESHOLD_MS = 5 * 60_000
/** Abaixo disso já sai do verde e vira aviso âmbar. */
const WARNING_THRESHOLD_MS = 15 * 60_000

const RING_RADIUS = 26
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/**
 * `mm:ss` enquanto o prazo cabe em uma hora — que é o caso normal do PIX — e
 * `h:mm:ss` só quando realmente passa disso. Nada de zeros à esquerda em
 * horas: "01:04:12" faz o cliente contar dígitos pra entender que tem uma hora.
 */
function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

/** "em 42 minutos", "em 1 hora" — o tempo dito por extenso, pra leitor de tela. */
function describeRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000))
  if (totalMinutes >= 60) {
    const hours = Math.round(totalMinutes / 60)
    return `em ${hours} ${hours === 1 ? "hora" : "horas"}`
  }
  if (totalMinutes <= 1) return "em menos de um minuto"
  return `em ${totalMinutes} minutos`
}

/**
 * Contagem regressiva do prazo do PIX na tela de pagamento.
 *
 * O prazo vem de `pix_expires_at` — a mesma coluna que o cron de expiração
 * usa —, então o que o usuário vê bate com o que o servidor vai aplicar. Ao
 * zerar, avisa o pai (`onExpired`): o cron roda a cada 15 min, então o
 * pedido pode continuar `pending` na API por um tempo depois do prazo, e
 * seria pior deixar o QR code na tela como se ainda desse pra pagar.
 */
export function PixCountdown({
  expiresAt,
  onExpired,
}: {
  expiresAt: string
  onExpired: () => void
}) {
  const deadline = useMemo(() => new Date(expiresAt).getTime(), [expiresAt])
  // O total é medido na montagem, não no prazo do gateway: é o que sobra pra
  // ESTE cliente: quem recarrega a página aos 20 min vê o anel cheio de novo,
  // representando os 20 min dele, em vez de um anel já pela metade.
  const [totalMs] = useState(() => Math.max(1, deadline - Date.now()))
  const [remaining, setRemaining] = useState(() => deadline - Date.now())

  useEffect(() => {
    const tick = () => setRemaining(deadline - Date.now())
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [deadline])

  useEffect(() => {
    if (remaining <= 0) onExpired()
  }, [remaining, onExpired])

  // Prazo ilegível vindo do gateway: melhor não mostrar nada do que mostrar
  // um contador maluco — o pedido segue pagável e o cron cuida do prazo.
  if (Number.isNaN(deadline)) return null

  const expired = remaining <= 0
  const urgent = !expired && remaining <= URGENT_THRESHOLD_MS
  const warning = !expired && !urgent && remaining <= WARNING_THRESHOLD_MS

  const tone = expired || urgent ? "urgent" : warning ? "warning" : "calm"
  const progress = Math.min(1, Math.max(0, remaining / totalMs))

  // Data + hora + fuso, sempre. Um "11:59" sozinho não diz que dia é, se é de
  // manhã ou de noite, nem em que fuso — e o cliente pode estar fora do Brasil
  // (ou com o relógio do sistema em outro fuso), vendo um horário que não é o
  // que o servidor vai aplicar. O prazo é do banco brasileiro: mostra em
  // horário de Brasília, com o rótulo do fuso à mostra.
  // Inclui o ano de propósito: sem ele um prazo absurdo (o QR da Asaas vale um
  // ano) aparece como um "30/08, 23:59" plausível, escondendo justamente o
  // dado que denuncia o erro.
  const deadlineLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(deadline))

  return (
    <div
      className={cn(
        "flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors",
        tone === "urgent" && "border-red-500/40 bg-red-500/[0.08]",
        tone === "warning" && "border-amber-500/30 bg-amber-500/[0.07]",
        tone === "calm" && "border-border bg-muted/30"
      )}
    >
      <div className="relative shrink-0">
        <svg viewBox="0 0 60 60" className={cn("size-14 -rotate-90", urgent && "animate-pulse")}>
          <circle
            cx="30"
            cy="30"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="4"
            className="stroke-foreground/10"
          />
          <circle
            cx="30"
            cy="30"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            className={cn(
              "transition-[stroke-dashoffset] duration-1000 ease-linear",
              tone === "urgent" && "stroke-red-400",
              tone === "warning" && "stroke-amber-400",
              tone === "calm" && "stroke-emerald-400"
            )}
          />
        </svg>
        {expired && (
          <span
            className="absolute inset-0 flex items-center justify-center text-lg"
            aria-hidden="true"
          >
            ⏳
          </span>
        )}
      </div>

      <div className="min-w-0 space-y-0.5">
        {expired ? (
          <>
            <p className="text-sm font-bold text-red-400">Prazo esgotado</p>
            <p className="text-xs text-muted-foreground">
              Este código PIX não pode mais ser pago.
            </p>
          </>
        ) : (
          <>
            {/* O número muda a cada segundo; um leitor de tela lendo isso em
                voz alta o tempo todo seria insuportável. Ele fica aria-hidden
                e a frase abaixo (estável, por extenso) carrega a informação. */}
            <p className="flex items-baseline gap-1.5" aria-hidden="true">
              <span
                className={cn(
                  "font-mono text-2xl font-black tabular-nums leading-none",
                  tone === "urgent" && "text-red-400",
                  tone === "warning" && "text-amber-400",
                  tone === "calm" && "text-foreground"
                )}
              >
                {formatRemaining(remaining)}
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {urgent ? "para pagar — corre!" : "para pagar"}
              </span>
            </p>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Vence {describeRemaining(remaining)}, às {deadlineLabel}. Depois disso o código perde
              a validade e os itens voltam ao estoque.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
