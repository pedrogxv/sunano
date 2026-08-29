"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { Toaster as SonnerToaster } from "sonner"
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react"

/**
 * Pilha de toasts do Sunano.
 *
 * `expand={false}` faz o Sonner empilhar os toasts *um sobre o outro* (deck),
 * mostrando só a borda dos que estão atrás — ocupa a altura de um único toast
 * em vez de crescer verticalmente. Ao passar o mouse (ou tocar) a pilha se abre.
 *
 * No mobile a pilha fica no topo, não embaixo: a borda inferior é disputada pelo
 * CookieBanner (fixed bottom-0 full-width), pelo FAB do AdminShell e pela barra
 * de ações de /perifericos — um toast ali sobrepõe todos eles. O offset desce
 * abaixo da TopBar via --sticky-header-h.
 */
const TOAST_DURATION = 4500

export function Toaster() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)")
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  return (
    <SonnerToaster
      position={isMobile ? "top-center" : "top-right"}
      theme="dark"
      expand={false}
      closeButton
      gap={8}
      visibleToasts={isMobile ? 3 : 4}
      duration={TOAST_DURATION}
      offset={isMobile ? "calc(var(--sticky-header-h) + 0.75rem)" : 20}
      // Por lado: o Sonner deriva a largura do toast no mobile de
      // `calc(100% - left * 2)`, então left/right precisam ser as margens
      // laterais reais — um valor único aplicado aos 4 lados encolhe o card.
      mobileOffset={{
        top: "calc(var(--sticky-header-h) + 0.75rem)",
        left: "0.75rem",
        right: "0.75rem",
        bottom: "0.75rem",
      }}
      icons={{
        success: <CheckCircle2 className="size-[18px]" strokeWidth={2.25} />,
        error: <XCircle className="size-[18px]" strokeWidth={2.25} />,
        warning: <AlertTriangle className="size-[18px]" strokeWidth={2.25} />,
        info: <Info className="size-[18px]" strokeWidth={2.25} />,
        loading: <Loader2 className="size-[18px] animate-spin" strokeWidth={2.25} />,
      }}
      toastOptions={{
        unstyled: true,
        // A barra de progresso é puramente CSS e precisa saber a duração; o
        // Sonner não expõe isso como custom property, então injetamos aqui.
        style: { "--sunano-toast-duration": `${TOAST_DURATION}ms` } as React.CSSProperties,
        classNames: {
          toast: "sunano-toast",
          title: "sunano-toast__title",
          description: "sunano-toast__description",
          icon: "sunano-toast__icon",
          content: "sunano-toast__content",
          actionButton: "sunano-toast__action",
          cancelButton: "sunano-toast__cancel",
          closeButton: "sunano-toast__close",
          success: "sunano-toast--success",
          error: "sunano-toast--error",
          warning: "sunano-toast--warning",
          info: "sunano-toast--info",
          loading: "sunano-toast--loading",
        },
      }}
    />
  )
}
