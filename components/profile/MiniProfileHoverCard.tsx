"use client"

import { useCallback, useRef, useState, type ReactNode } from "react"
import { HoverCard as HoverCardPrimitive } from "radix-ui"

import { MiniProfileCard } from "./MiniProfileCard"
import type { MiniProfile } from "@/lib/mini-profile"

/** Cache por slug, compartilhado entre todas as instâncias do cartão.
 *  Passar o cursor de novo sobre o mesmo perfil não repete a requisição.
 *
 *  Com TTL: sem ele a entrada vivia enquanto a aba existisse, então trocar um
 *  cosmético (fundo do cartão, moldura) só aparecia depois de um reload — o
 *  próprio dono via o cartão antigo indefinidamente. O TTL acompanha o
 *  `max-age` da resposta de `/api/users/mini-profile`. */
const CACHE_TTL_MS = 60_000
const cache = new Map<string, { profile: MiniProfile; at: number }>()

function readCache(slug: string): MiniProfile | null {
  const hit = cache.get(slug)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(slug)
    return null
  }
  return hit.profile
}

/** Descarta a entrada de um perfil — chamado após equipar/desequipar um
 *  cosmético, para o cartão do próprio usuário refletir a troca na hora. */
export function invalidateMiniProfile(slug?: string | null) {
  if (slug) cache.delete(slug)
  else cache.clear()
}

/**
 * Envolve um avatar/nome com o cartão de Mini Perfil, que abre ao passar o
 * cursor — o mesmo gesto do preview de perfil da Steam.
 *
 * Os dados chegam sob demanda na primeira abertura (`/api/users/mini-profile`),
 * então nenhuma listagem precisa passar a carregar `mini_banner_url`, bio e
 * contadores só porque o cartão existe.
 *
 * Em telas de toque o Radix não dispara hover: o `children` continua sendo o
 * link normal para o perfil, que é o comportamento esperado ali.
 */
export function MiniProfileHoverCard({
  slug,
  children,
  side = "top",
  align = "center",
}: {
  /** Slug do perfil (`/perfil/<slug>`). Sem ele o cartão não abre. */
  slug: string | null | undefined
  children: ReactNode
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
}) {
  const [profile, setProfile] = useState<MiniProfile | null>(() =>
    slug ? readCache(slug) : null
  )
  // Evita disparar duas buscas quando o cursor entra e sai rápido.
  const pending = useRef(false)

  const load = useCallback(
    async (open: boolean) => {
      if (!open || !slug || pending.current) return
      const cached = readCache(slug)
      if (cached) {
        setProfile(cached)
        return
      }
      pending.current = true
      try {
        const res = await fetch(`/api/users/mini-profile?slug=${encodeURIComponent(slug)}`)
        const data = (await res.json().catch(() => null)) as { profile?: MiniProfile } | null
        if (res.ok && data?.profile) {
          cache.set(slug, { profile: data.profile, at: Date.now() })
          setProfile(data.profile)
        }
      } catch {
        // Silencioso de propósito: o cartão é um extra, e o link embaixo
        // continua levando ao perfil completo.
      } finally {
        pending.current = false
      }
    },
    [slug]
  )

  if (!slug) return <>{children}</>

  return (
    // Abertura quase imediata: o cartão é o conteúdo principal do gesto, não
    // uma dica secundária que precise de pausa antes de aparecer. O
    // `closeDelay` é o que evita piscar quando o cursor cruza a borda a caminho
    // do próprio cartão.
    <HoverCardPrimitive.Root openDelay={100} closeDelay={120} onOpenChange={load}>
      <HoverCardPrimitive.Trigger asChild>{children}</HoverCardPrimitive.Trigger>
      {profile && (
        <HoverCardPrimitive.Portal>
          <HoverCardPrimitive.Content
            side={side}
            align={align}
            sideOffset={8}
            collisionPadding={12}
            className="z-50 duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            <MiniProfileCard profile={profile} />
          </HoverCardPrimitive.Content>
        </HoverCardPrimitive.Portal>
      )}
    </HoverCardPrimitive.Root>
  )
}
