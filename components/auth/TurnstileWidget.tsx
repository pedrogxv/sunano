"use client"

import { useEffect, useId, useRef, useState } from "react"
import Script from "next/script"

/**
 * Widget do Cloudflare Turnstile para login e cadastro.
 *
 * Sem `NEXT_PUBLIC_TURNSTILE_SITE_KEY` configurada, não renderiza nada — o
 * form segue funcionando sem captcha (mesmo "falha aberto" da verificação
 * server-side em `lib/server/integrations/turnstile.ts`), útil em dev local
 * onde a env ainda não foi provisionada.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          theme?: "light" | "dark" | "auto"
          callback?: (token: string) => void
          "error-callback"?: () => void
          "expired-callback"?: () => void
        }
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

interface TurnstileWidgetProps {
  onTokenChange: (token: string | null) => void
  error?: boolean
}

export function TurnstileWidget({ onTokenChange, error }: TurnstileWidgetProps) {
  const containerId = useId()
  const widgetIdRef = useRef<string | null>(null)
  // Inicializa checando `window.turnstile` diretamente: ao trocar de aba
  // login/cadastro dentro do AuthModal, este componente desmonta e remonta,
  // mas o `<script>` da Cloudflare já está no DOM (o Next dedupa por `src`) —
  // o `onLoad` do `next/script` só dispara na primeira montagem da página
  // inteira, então esperar só por ele deixava `scriptLoaded` travado em
  // `false` (e o captcha nunca mais renderizava) da segunda vez em diante.
  const [scriptLoaded, setScriptLoaded] = useState(
    () => typeof window !== "undefined" && Boolean(window.turnstile)
  )

  useEffect(() => {
    if (scriptLoaded || typeof window === "undefined") return
    if (window.turnstile) {
      setScriptLoaded(true)
      return
    }
    const interval = setInterval(() => {
      if (window.turnstile) {
        setScriptLoaded(true)
        clearInterval(interval)
      }
    }, 100)
    return () => clearInterval(interval)
  }, [scriptLoaded])

  useEffect(() => {
    if (!scriptLoaded || !SITE_KEY) return
    const container = document.getElementById(containerId)
    if (!container || !window.turnstile) return

    const widgetId = window.turnstile.render(container, {
      sitekey: SITE_KEY,
      theme: "auto",
      callback: (token) => onTokenChange(token),
      "error-callback": () => onTokenChange(null),
      "expired-callback": () => onTokenChange(null),
    })
    widgetIdRef.current = widgetId

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded, containerId])

  if (!SITE_KEY) return null

  return (
    <div className="space-y-1.5">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      <div id={containerId} className="flex justify-center" />
      {error && (
        <p className="text-center text-xs text-destructive">
          Confirme que você não é um robô para continuar.
        </p>
      )}
    </div>
  )
}
