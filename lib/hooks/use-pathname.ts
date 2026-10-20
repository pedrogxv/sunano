"use client"

import { usePathname as useNextPathname } from "next/navigation"

/**
 * `usePathname` do Next, com a Home normalizada para "/". Todo componente usa
 * este, nunca o de `next/navigation` (regra no eslint.config.mjs).
 *
 * Quando o ISR regera a Home em segundo plano (`revalidate` de app/page.tsx),
 * o Next 16 renderiza a rota com o caminho interno `/index` (o payload RSC sai
 * com `"c":["","index"]`), e o `usePathname` do servidor devolve "/index". No
 * navegador ele devolve "/". Todo texto ou classe derivado do caminho saía
 * diferente nos dois lados: a TopBar escrevia "Sunano" (fallback) no HTML e
 * "Home" na hidratação, o React lançava o erro #418 (que o Lighthouse aponta
 * em "Erros do navegador no console") e jogava fora o HTML do servidor para
 * renderizar a página inteira de novo no cliente. Só a primeira renderização
 * depois do deploy saía certa, então o erro aparecia e sumia.
 */
export function usePathname(): string {
  const pathname = useNextPathname()
  return pathname === "/index" ? "/" : pathname
}
