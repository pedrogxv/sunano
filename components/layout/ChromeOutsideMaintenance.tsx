"use client"

import { usePathname } from "next/navigation"

/**
 * Esconde elementos globais na tela `/maintenance`.
 *
 * O banner de cookies é consentimento para navegar o site — em manutenção não
 * há site para navegar nem coleta acontecendo, e ele aparecia por cima da
 * única tela que o visitante consegue abrir. Some aqui e volta a aparecer
 * normalmente quando o site reabre (o consentimento não é gravado enquanto
 * está escondido, então continua sendo pedido depois).
 *
 * A sidebar e a TopBar somem por outro caminho, em `LayoutShell`.
 */
export function ChromeOutsideMaintenance({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname === "/maintenance") return null
  return <>{children}</>
}
