import { Suspense } from "react"

import { AuthBackgroundScene } from "@/components/auth/AuthBackgroundScene"
import { EMPTY_AUTH_BACKGROUND, getAuthBackgroundData } from "@/lib/server/auth-background-data"

async function AuthBackgroundWithData() {
  const data = await getAuthBackgroundData().catch(() => EMPTY_AUTH_BACKGROUND)
  return <AuthBackgroundScene data={data} />
}

/**
 * Fundo das telas de sessão. O formulário nunca espera por ele: enquanto o
 * conteúdo do banco não chega, só os cards estáticos aparecem.
 */
export function AuthBackground() {
  return (
    <Suspense fallback={<AuthBackgroundScene data={EMPTY_AUTH_BACKGROUND} />}>
      <AuthBackgroundWithData />
    </Suspense>
  )
}
