import "server-only"

import { payerAddressSchema, payerInfoSchema } from "@/lib/server/validation/guest-checkout"
import {
  parseOptionalShippingAddress,
  type ShippingAddressInput,
} from "@/lib/server/validation/shipping-address"

/**
 * Cobrança validada para gravar no perfil. Telefone e endereço são `null`
 * quando a pessoa os deixou em branco (ou apagou): em Minha conta eles são
 * opcionais, e só o checkout de cartão os exige na hora de pagar.
 */
export type PayerProfileInput = {
  fullName: string
  cpf: string
  phone: string | null
  address: {
    postalCode: string
    street: string
    number: string
    complement: string | null
    neighborhood: string
    city: string
    state: string
  } | null
}

export type PurchaseProfileUpdate =
  | { kind: "payer"; payer: PayerProfileInput }
  | { kind: "shipping"; shipping: ShippingAddressInput | null }

const ADDRESS_KEYS = [
  "guestPostalCode",
  "guestStreet",
  "guestNumber",
  "guestNeighborhood",
  "guestCity",
  "guestState",
] as const

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === ""
}

/**
 * Corpo do `PATCH /api/profile/purchase-data`: `{ payer: {...} }` OU
 * `{ shipping: {...} }`, cada card de Minha conta salva o seu.
 *
 * Usa os MESMOS schemas do checkout (`payerInfoSchema`, `payerAddressSchema`,
 * `parseOptionalShippingAddress`) e os mesmos nomes de campo (`guest*`,
 * `shipping*`): um dado aceito numa tela é aceito na outra, e os formulários
 * montam o corpo com o mesmo helper.
 *
 * Endereço de cobrança é inteiro ou nada: pela metade, o checkout de cartão o
 * leria como incompleto e pediria tudo de novo — e salvar "Rua X" sem número
 * pareceria pronto sem estar.
 */
export function parsePurchaseProfileUpdate(
  body: unknown
): { ok: true; update: PurchaseProfileUpdate } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Requisição inválida." }
  const record = body as Record<string, unknown>

  if (record.payer && typeof record.payer === "object") {
    const payer = record.payer as Record<string, unknown>

    const info = payerInfoSchema.safeParse(payer)
    if (!info.success) {
      return { ok: false, error: info.error.issues[0]?.message ?? "Informe seu nome e CPF." }
    }

    let phone: string | null = null
    if (!isBlank(payer.guestPhone)) {
      const parsed = payerAddressSchema.shape.guestPhone.safeParse(payer.guestPhone)
      if (!parsed.success) {
        return { ok: false, error: parsed.error.issues[0]?.message ?? "Informe um telefone válido." }
      }
      phone = parsed.data
    }

    let address: PayerProfileInput["address"] = null
    if (ADDRESS_KEYS.some((key) => !isBlank(payer[key]))) {
      const parsed = payerAddressSchema.omit({ guestPhone: true }).safeParse(payer)
      if (!parsed.success) {
        return {
          ok: false,
          error:
            parsed.error.issues[0]?.message ??
            "Endereço de cobrança incompleto. Preencha todos os campos ou deixe em branco.",
        }
      }
      address = {
        postalCode: parsed.data.guestPostalCode,
        street: parsed.data.guestStreet,
        number: parsed.data.guestNumber,
        complement: parsed.data.guestComplement || null,
        neighborhood: parsed.data.guestNeighborhood,
        city: parsed.data.guestCity,
        state: parsed.data.guestState,
      }
    }

    return {
      ok: true,
      update: {
        kind: "payer",
        payer: { fullName: info.data.guestName, cpf: info.data.guestDocument, phone, address },
      },
    }
  }

  if (record.shipping && typeof record.shipping === "object") {
    const parsed = parseOptionalShippingAddress(record.shipping)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    return { ok: true, update: { kind: "shipping", shipping: parsed.address } }
  }

  return { ok: false, error: "Requisição inválida." }
}
