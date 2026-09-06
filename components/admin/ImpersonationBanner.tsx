"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Eye, LogOut } from "lucide-react"
import { toast } from "sonner"

import { IMPERSONATION_ACTIVE_COOKIE } from "@/lib/impersonation-shared"

type ActiveState = { target: string; expiresAt: number }

/** Altura da barra do topo e espessura da moldura, em px. Usadas tanto no
 *  layout (padding do body) quanto no desenho da moldura. */
const BAR_HEIGHT = 44
const FRAME_WIDTH = 3

function readActiveCookie(): ActiveState | null {
  if (typeof document === "undefined") return null
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${IMPERSONATION_ACTIVE_COOKIE}=`))
  if (!match) return null
  try {
    const raw = decodeURIComponent(match.slice(IMPERSONATION_ACTIVE_COOKIE.length + 1))
    const parsed = JSON.parse(raw) as ActiveState
    if (!parsed || typeof parsed.expiresAt !== "number") return null
    return parsed
  } catch {
    return null
  }
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "expirando…"
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

/**
 * Barra fixa + moldura âmbar exibida SEMPRE que o WEB MASTER está "logado como"
 * um usuário. O sinal vem do cookie `imp-active` (não httpOnly, sem segredo —
 * só nome do alvo e expiração). Montada no layout raiz, então aparece em
 * qualquer página do site durante a sessão.
 */
export function ImpersonationBanner() {
  // Estado inicial lido de forma lazy (evita setState síncrono em effect).
  const [state, setState] = useState<ActiveState | null>(() => readActiveCookie())
  const [remainingMs, setRemainingMs] = useState<number>(() => {
    const s = readActiveCookie()
    return s ? s.expiresAt - Date.now() : 0
  })
  const [ending, setEnding] = useState(false)
  const endingRef = useRef(false)

  const stop = useCallback(async () => {
    if (endingRef.current) return
    endingRef.current = true
    setEnding(true)
    try {
      const res = await fetch("/api/admin/impersonate/stop", { method: "POST" })
      const data = (await res.json().catch(() => null)) as { redirectTo?: string } | null
      window.location.href = data?.redirectTo ?? "/admin/users"
    } catch {
      toast.error("Falha ao encerrar o acesso. Recarregue a página.")
      endingRef.current = false
      setEnding(false)
    }
  }, [])

  useEffect(() => {
    // Um único tick por segundo: relê o cookie, recalcula o tempo restante e,
    // se expirou, aciona o encerramento. Nenhum setState no corpo do effect.
    const id = setInterval(() => {
      const next = readActiveCookie()
      setState(next)
      const ms = next ? next.expiresAt - Date.now() : 0
      setRemainingMs(ms)
      if (next && ms <= 0) void stop()
    }, 1000)
    return () => clearInterval(id)
  }, [stop])

  if (!state) return null

  return (
    <>
      {/* A barra ocupa o topo da viewport (position: fixed). Para não cobrir
          nada:
            • `body` ganha padding-top = altura da barra, empurrando todo o
              conteúdo para baixo dela;
            • a TopBar e o wrapper da sidebar (ambos `sticky top-0`) passam a
              grudar ABAIXO da barra ao rolar — sem isso eles subiriam para
              trás dela. Seletores presos às classes exatas desses dois
              elementos (ver LayoutShell.tsx / TopBar.tsx) para não afetar
              outros `sticky` aninhados nas páginas.
          A moldura âmbar fica só nas laterais/base, fina, decorativa. */}
      <style>{`
        body { padding-top: ${BAR_HEIGHT}px; }
        .sticky.top-0.z-20 { top: ${BAR_HEIGHT}px; }
        @media (min-width: 768px) {
          .md\\:sticky.md\\:top-0.md\\:h-screen { top: ${BAR_HEIGHT}px; }
        }
      `}</style>

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[95] border-amber-500/80"
        style={{ borderWidth: `0 ${FRAME_WIDTH}px ${FRAME_WIDTH}px` }}
      />

      <div
        className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-amber-500 px-4 text-sm font-medium text-black shadow-lg"
        style={{ height: `${BAR_HEIGHT}px` }}
      >
        <Eye className="size-4 shrink-0" />
        <span className="truncate">
          Você está navegando como <strong>{state.target}</strong> — modo somente leitura
        </span>
        <span className="shrink-0 rounded bg-black/15 px-1.5 py-0.5 font-mono text-xs tabular-nums">
          {formatRemaining(remainingMs)}
        </span>
        <button
          type="button"
          onClick={stop}
          disabled={ending}
          className="ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-md bg-black px-2.5 py-1 text-xs font-semibold text-white hover:bg-black/80 disabled:opacity-50"
        >
          <LogOut className="size-3.5" />
          {ending ? "Encerrando…" : "Encerrar"}
        </button>
      </div>
    </>
  )
}
