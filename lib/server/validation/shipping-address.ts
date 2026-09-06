import "server-only"
import * as z from "zod"

/**
 * UFs válidas — o `length(2)` sozinho aceitaria "XX" e mandaria um pedido
 * impossível de despachar para a fila do admin.
 */
const BR_UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
])

/**
 * Endereço de ENTREGA do pedido — separado de `payerAddressSchema`
 * (`guest-checkout.ts`), que é o endereço de COBRANÇA exigido pela Asaas
 * para criar o customer no checkout de cartão. Os dois podem divergir
 * (compra no cartão do pai, entrega no endereço do filho), e a Asaas só
 * guarda um endereço por customer — então a fonte de verdade da entrega é
 * `store_orders.shipping_*`, nunca o gateway.
 *
 * Todos os campos são validados no servidor mesmo quando o endereço é
 * opcional: "opcional" significa poder não enviar NADA, não poder enviar
 * lixo. Um objeto parcial é recusado por inteiro (ver
 * `parseOptionalShippingAddress`).
 */
export const shippingAddressSchema = z.object({
  shippingRecipient: z
    .string("Informe o nome de quem vai receber.")
    .trim()
    .min(2, "Informe o nome de quem vai receber.")
    .max(200, "Nome de quem recebe muito longo."),
  shippingPhone: z
    .string("Informe um telefone válido.")
    .transform((value) => value.replace(/\D/g, ""))
    .refine(
      (value) => value.length === 10 || value.length === 11,
      "Informe um telefone válido."
    ),
  shippingPostalCode: z
    .string("Informe um CEP válido.")
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => value.length === 8, "Informe um CEP válido."),
  shippingStreet: z
    .string("Informe o endereço de entrega.")
    .trim()
    .min(2, "Informe o endereço de entrega.")
    .max(200, "Endereço muito longo."),
  shippingNumber: z
    .string("Informe o número.")
    .trim()
    .min(1, "Informe o número.")
    .max(20, "Número muito longo."),
  shippingComplement: z.string().trim().max(100, "Complemento muito longo.").optional(),
  shippingNeighborhood: z
    .string("Informe o bairro.")
    .trim()
    .min(1, "Informe o bairro.")
    .max(100, "Bairro muito longo."),
  shippingCity: z
    .string("Informe a cidade.")
    .trim()
    .min(1, "Informe a cidade.")
    .max(100, "Cidade muito longa."),
  shippingState: z
    .string("Informe o estado (UF).")
    .trim()
    .length(2, "Informe o estado (UF).")
    .transform((value) => value.toUpperCase())
    .refine((value) => BR_UFS.has(value), "Informe um estado (UF) válido."),
})

export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>

/**
 * Endereço de entrega OPCIONAL vindo do corpo de uma requisição.
 *
 * Três resultados possíveis, e a distinção importa:
 * - `{ ok: true, address: null }` — o cliente não mandou endereço nenhum
 *   (legítimo enquanto o preenchimento é opcional);
 * - `{ ok: true, address: {...} }` — endereço completo e válido;
 * - `{ ok: false, error }` — mandou algo, mas incompleto/inválido. Nunca
 *   gravamos endereço pela metade: um pedido com rua e sem número é pior
 *   que um pedido sem endereço, porque parece pronto para despachar.
 */
export function parseOptionalShippingAddress(
  body: unknown
): { ok: true; address: ShippingAddressInput | null } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: true, address: null }

  const record = body as Record<string, unknown>
  const keys = Object.keys(shippingAddressSchema.shape) as (keyof ShippingAddressInput)[]
  const provided = keys.filter((key) => {
    const value = record[key]
    return value !== undefined && value !== null && String(value).trim() !== ""
  })

  // `shippingComplement` sozinho não conta como "tentou informar endereço" —
  // é o único campo opcional dentro do bloco.
  const meaningful = provided.filter((key) => key !== "shippingComplement")
  if (meaningful.length === 0) return { ok: true, address: null }

  const parsed = shippingAddressSchema.safeParse(record)
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Endereço de entrega incompleto. Preencha todos os campos ou deixe em branco.",
    }
  }
  return { ok: true, address: parsed.data }
}

/**
 * Produtos que exigem endereço de entrega.
 *
 * A pergunta "este carrinho precisa de endereço?" é sempre respondida pela
 * coluna `requires_shipping` de `store_products` — nunca por env nem por
 * suposição de que "tudo na loja é físico". Um serviço (mentoria, setup
 * remoto) marca a coluna como false e o checkout deixa de pedir CEP; um
 * serviço que precisa do endereço mesmo assim (visita técnica) marca true.
 *
 * O endereço NUNCA bloqueia o checkout: a compra fecha sem ele e o cliente
 * completa depois de pagar, em "Meus Pedidos" (status
 * `awaiting_shipping_info`). O que muda com `requires_shipping` é se o
 * pedido entra ou não na fila de "falta endereço".
 */
export function orderNeedsShippingAddress(
  lines: { product: { requires_shipping?: boolean | null } }[]
): boolean {
  return lines.some((line) => line.product.requires_shipping !== false)
}
