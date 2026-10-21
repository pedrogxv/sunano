import "server-only"

import type { PurchaseProfile } from "@/lib/purchase-profile"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import type { PayerProfileInput } from "@/lib/server/validation/purchase-profile"
import {
  shippingAddressColumns,
  type ShippingAddressInput,
} from "@/lib/server/validation/shipping-address"

const PURCHASE_PROFILE_COLUMNS =
  "full_name, cpf, phone, postal_code, street, number, complement, neighborhood, city, state, shipping_recipient, shipping_cpf, shipping_birth_date, shipping_residence_type, shipping_phone, shipping_postal_code, shipping_street, shipping_number, shipping_complement, shipping_neighborhood, shipping_city, shipping_state"

/** Todas as colunas `shipping_*` do perfil em `null` — "apagar a entrega salva". */
const EMPTY_SHIPPING_COLUMNS = {
  shipping_recipient: null,
  shipping_cpf: null,
  shipping_birth_date: null,
  shipping_residence_type: null,
  shipping_phone: null,
  shipping_postal_code: null,
  shipping_street: null,
  shipping_number: null,
  shipping_complement: null,
  shipping_neighborhood: null,
  shipping_city: null,
  shipping_state: null,
}

/**
 * Cobrança + última entrega salvas no perfil. Leitor único de checkout e
 * Minha conta, para as duas telas não montarem cada uma o seu select (e uma
 * delas esquecer o campo novo).
 *
 * `null` quando a consulta falha — a rota responde 5xx em vez de mandar um
 * perfil vazio, que o checkout leria como "não tem nada salvo".
 */
export async function getPurchaseProfile(userId: string): Promise<PurchaseProfile | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_profiles")
    .select(PURCHASE_PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    console.error("[purchase-profile] falha ao ler perfil:", error.message)
    return null
  }

  return {
    payer: {
      fullName: data?.full_name ?? null,
      cpf: data?.cpf ?? null,
      phone: data?.phone ?? null,
      postalCode: data?.postal_code ?? null,
      street: data?.street ?? null,
      number: data?.number ?? null,
      complement: data?.complement ?? null,
      neighborhood: data?.neighborhood ?? null,
      city: data?.city ?? null,
      state: data?.state ?? null,
    },
    shipping: {
      recipient: data?.shipping_recipient ?? null,
      cpf: data?.shipping_cpf ?? null,
      birthDate: data?.shipping_birth_date ?? null,
      residenceType: data?.shipping_residence_type ?? null,
      phone: data?.shipping_phone ?? null,
      postalCode: data?.shipping_postal_code ?? null,
      street: data?.shipping_street ?? null,
      number: data?.shipping_number ?? null,
      complement: data?.shipping_complement ?? null,
      neighborhood: data?.shipping_neighborhood ?? null,
      city: data?.shipping_city ?? null,
      state: data?.shipping_state ?? null,
    },
  }
}

/** Cobrança: nome, CPF, telefone e endereço do titular. Campo em branco vira `null`. */
export async function savePayerProfile(
  userId: string,
  payer: PayerProfileInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("user_profiles")
    .update({
      full_name: payer.fullName,
      cpf: payer.cpf,
      phone: payer.phone,
      postal_code: payer.address?.postalCode ?? null,
      street: payer.address?.street ?? null,
      number: payer.address?.number ?? null,
      complement: payer.address?.complement ?? null,
      neighborhood: payer.address?.neighborhood ?? null,
      city: payer.address?.city ?? null,
      state: payer.address?.state ?? null,
    })
    .eq("id", userId)

  if (error) {
    console.error("[purchase-profile] falha ao salvar cobrança:", error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/**
 * Entrega salva no perfil (só pré-preenche a próxima compra; o que vale para
 * despachar é o snapshot em `store_orders`). `null` apaga a entrega salva.
 */
export async function saveShippingProfile(
  userId: string,
  shipping: ShippingAddressInput | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("user_profiles")
    .update(shipping ? shippingAddressColumns(shipping) : EMPTY_SHIPPING_COLUMNS)
    .eq("id", userId)

  if (error) {
    console.error("[purchase-profile] falha ao salvar entrega:", error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
