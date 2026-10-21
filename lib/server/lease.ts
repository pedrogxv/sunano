import "server-only"

import { randomUUID } from "crypto"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { isMissingDbFunction } from "@/lib/server/repositories/_shared"

/**
 * Trava com prazo (`app_leases`, migration 20270101000000): uma operação por
 * chave por vez, entre todas as instâncias da Function.
 *
 * Para quando "ler, decidir e gravar" atravessa várias idas ao banco e a
 * decisão depende do que outra requisição IGUAL está gravando ao mesmo tempo:
 * o checkout confere "quantos pedidos pendentes você tem" muito antes de
 * gravar o pedido, e o estorno lê `refunded_cents` antes de chamar o gateway.
 * Sem a trava, N requisições simultâneas passavam todas pela conferência.
 *
 * O prazo é a rede de segurança, não o mecanismo: quem pega SEMPRE solta
 * (`release`, num `finally`). Se a Function morrer antes, a trava vence sozinha
 * e a próxima requisição segue. Por isso o prazo tem de cobrir o `maxDuration`
 * da rota que segura a trava.
 */
export type Lease = {
  acquired: boolean
  /** Por que não pegou: outra requisição segura a trava, ou o banco falhou. */
  reason?: "busy" | "error"
  /** Solta a trava. Idempotente, nunca lança. */
  release: () => Promise<void>
}

const NOOP_RELEASE = async () => {}

export async function acquireLease(key: string, ttlSeconds: number): Promise<Lease> {
  const db = createSupabaseAdminClient()
  const owner = randomUUID()

  const { data, error } = await db.rpc("acquire_lease", {
    p_key: key,
    p_owner: owner,
    p_ttl_seconds: ttlSeconds,
  })

  // Migration ainda não aplicada: segue sem trava, que é exatamente o
  // comportamento de antes dela existir. Remover quando a 20270101000000
  // estiver em produção.
  if (isMissingDbFunction(error)) return { acquired: true, release: NOOP_RELEASE }

  if (error) {
    // Banco degradado: recusar é o lado seguro (quem chama responde "tente de
    // novo"). Deixar passar sem trava reabriria a corrida justamente no pico.
    console.error(`[lease] acquire ${key} falhou:`, error.message)
    return { acquired: false, reason: "error", release: NOOP_RELEASE }
  }

  if (!data) return { acquired: false, reason: "busy", release: NOOP_RELEASE }

  let released = false
  return {
    acquired: true,
    release: async () => {
      if (released) return
      released = true
      const { error: releaseError } = await db.rpc("release_lease", { p_key: key, p_owner: owner })
      if (releaseError) console.error(`[lease] release ${key} falhou:`, releaseError.message)
    },
  }
}
