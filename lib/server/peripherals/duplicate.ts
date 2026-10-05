import "server-only"

import type { ALLOWED_PERIPHERAL_CATEGORIES } from "@/lib/db-errors"
import type { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

type AdminClient = ReturnType<typeof createSupabaseAdminClient>
type PeripheralCategory = (typeof ALLOWED_PERIPHERAL_CATEGORIES)[number]

/** Nome comparável: sem diferença de caixa nem de espaço sobrando. */
export function normalizePeripheralName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase()
}

export const PERIPHERAL_DUPLICATE_MESSAGE =
  "Já existe um periférico com esse nome nessa marca e categoria. Edite o cadastro existente em vez de criar outro."

/**
 * Id do periférico que já ocupa nome + marca + categoria, ou `null`.
 *
 * A chave inclui a CATEGORIA de propósito: o ATK Duckbill mouse e o ATK
 * Duckbill mousepad são dois produtos e convivem. Duplicata é o mesmo nome
 * duas vezes na mesma categoria (DeathAdder V3 Pro, Apex Control), que vira
 * duas fichas, dois tiers e reviews divididas entre elas.
 *
 * A comparação é em TS, não `ilike`, para pegar também espaço sobrando
 * ("ATK  Duckbill "). Marca + categoria é um recorte pequeno.
 */
export async function findDuplicatePeripheral(
  db: AdminClient,
  input: { name: string; brandId: string; category: PeripheralCategory; excludeId?: string },
): Promise<string | null> {
  const target = normalizePeripheralName(input.name)
  const { data, error } = await db
    .from("peripherals")
    .select("id, name")
    .eq("brand_id", input.brandId)
    .eq("category", input.category)
  if (error) throw error
  const match = (data ?? []).find(
    (row) => row.id !== input.excludeId && normalizePeripheralName(row.name) === target,
  )
  return match?.id ?? null
}
