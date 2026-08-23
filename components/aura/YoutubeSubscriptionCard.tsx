"use client"

import { Check, Youtube } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { YoutubeSubscribeButton } from "@/components/auth/YoutubeSubscribeButton"

interface YoutubeSubscriptionCardProps {
  confirmed: boolean
  requireLogin?: () => boolean
  className?: string
}

/**
 * Conquista especial "Inscrito" — binária (sem tiers, diferente de
 * `AchievementsGrid`), concedida ao confirmar inscrição no canal do YouTube
 * via OAuth. Reaproveita a técnica de glow de `.event-card-glow`
 * (app/globals.css, mesma usada nas medalhas/conquistas normais) com
 * `--glow-color` vermelho, no estilo visual do YouTube. Usado nos 3 pontos
 * pedidos: Central de Aura, Central de Conquistas e popover da TopBar
 * (versão compacta em AuraMissionsBadge).
 */
export function YoutubeSubscriptionCard({ confirmed, requireLogin, className }: YoutubeSubscriptionCardProps) {
  return (
    <div
      
      className={cn(
        "event-card-glow relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between",
        confirmed ? "border-red-600/50 bg-red-600/[0.06]" : CARD_SURFACE,
        className
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full border-2",
            confirmed ? "border-red-600 bg-red-600 text-white" : "border-red-600/40 bg-red-600/10 text-red-500"
          )}
        >
          {confirmed ? <Check className="size-6" /> : <Youtube className="size-6" />}
        </span>
        <div className="space-y-0.5">
          <p className="flex items-center gap-2 font-display text-base font-bold text-foreground">
            Inscrito
            {confirmed && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Conquistado
              </span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {confirmed
              ? "Você confirmou sua inscrição no canal do Sunano no YouTube."
              : "Ganhe uma conquista especial por ser inscrito no nosso canal — só rola uma vez!"}
          </p>
        </div>
      </div>

      {!confirmed && (
        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
          <YoutubeSubscribeButton requireLogin={requireLogin} />
          <span className="text-xs font-bold text-red-500">+50 de Aura</span>
        </div>
      )}
    </div>
  )
}
