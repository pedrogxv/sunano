import { NextRequest, NextResponse } from "next/server"

import { getRequestUser, isImpersonating } from "@/lib/server/auth/current-user"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { setOrderShippingAddress } from "@/lib/server/repositories/orders-repository"
import { shippingAddressSchema } from "@/lib/server/validation/shipping-address"

export const runtime = "nodejs"

/**
 * Informa (ou corrige) o endereço de entrega de um pedido já criado — o
 * caminho para quem pulou o endereço no checkout e voltou depois de pagar,
 * a partir de "Meus Pedidos".
 *
 * O checkout grava o endereço direto no insert do pedido; esta rota existe
 * só para o preenchimento posterior. A checagem de posse fica no
 * repositório, no próprio UPDATE (`metadata->>user_id`), não aqui —
 * validação de dono feita só na rota é o tipo de coisa que se perde quando
 * surge um segundo chamador.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  // Segunda trava do modo somente-leitura da impersonation (ver proxy.ts):
  // mudar para onde o pacote de outra pessoa vai é escrita sensível.
  if (isImpersonating(request)) {
    return NextResponse.json(
      {
        error: "impersonation_read_only",
        message: "Sessão de acesso é somente leitura — não é possível alterar o endereço de entrega.",
      },
      { status: 403 }
    )
  }

  // Limite por usuário (não por IP): impede enumerar ids de pedido chutando
  // UUIDs numa conta válida, sem punir quem compartilha IP.
  const { allowed } = await checkRateLimit({
    action: "order_shipping_address_set",
    identifier: `${user.id}:${getClientIdentifier(request)}`,
    maxAttempts: 20,
    windowSeconds: 600,
    onError: "closed",
  })
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    )
  }

  const rawBody = await request.json().catch(() => null)
  const parsed = shippingAddressSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Endereço de entrega inválido." },
      { status: 400 }
    )
  }

  const result = await setOrderShippingAddress(id, user.id, {
    recipient: parsed.data.shippingRecipient,
    phone: parsed.data.shippingPhone,
    postalCode: parsed.data.shippingPostalCode,
    street: parsed.data.shippingStreet,
    number: parsed.data.shippingNumber,
    complement: parsed.data.shippingComplement ?? null,
    neighborhood: parsed.data.shippingNeighborhood,
    city: parsed.data.shippingCity,
    state: parsed.data.shippingState,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  // Guarda como última ENTREGA usada, para pré-preencher a próxima compra —
  // nas colunas `shipping_*`, NUNCA nas de cobrança. Entrega e cobrança
  // dividiam as mesmas colunas, então comprar para presentear sobrescrevia o
  // endereço de cobrança do titular com o do presenteado, e ele voltava para
  // a Asaas como endereço do dono do cartão na compra seguinte. O checkout já
  // faz essa separação (ver app/api/store/checkout/route.ts); esta rota é o
  // outro caminho que chega no mesmo perfil e precisa da mesma regra.
  //
  // Falha aqui não invalida o endereço já gravado no pedido (que é o dado
  // que importa para despachar), então não derruba a resposta.
  try {
    const { createSupabaseAdminClient } = await import("@/lib/server/supabase/admin-client")
    await createSupabaseAdminClient()
      .from("user_profiles")
      .update({
        shipping_recipient: parsed.data.shippingRecipient,
        shipping_phone: parsed.data.shippingPhone,
        shipping_postal_code: parsed.data.shippingPostalCode,
        shipping_street: parsed.data.shippingStreet,
        shipping_number: parsed.data.shippingNumber,
        shipping_complement: parsed.data.shippingComplement ?? null,
        shipping_neighborhood: parsed.data.shippingNeighborhood,
        shipping_city: parsed.data.shippingCity,
        shipping_state: parsed.data.shippingState,
      })
      .eq("id", user.id)
  } catch (err) {
    console.error("[shipping-address] falha ao salvar endereço no perfil:", err)
  }

  return NextResponse.json({ ok: true })
}
