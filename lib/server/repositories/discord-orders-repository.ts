import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  createOrderThread,
  DiscordApiError,
  editMessage,
  getDiscordConfig,
  pinMessage,
  postMessage,
  type DiscordConfig,
} from "@/lib/server/integrations/discord"
import {
  buildDashboardEmbed,
  buildEventEmbed,
  buildLinkButtons,
  isActionable,
  statusStyle,
  threadName,
  type OrderCardData,
  type OrderCardItem,
  type OrderEventStatus,
} from "@/lib/server/integrations/discord-order-card"

/**
 * Notificação de pedidos no Discord — orquestração.
 *
 * DESENHO: um canal (`DISCORD_ORDERS_CHANNEL_ID`), uma **thread por pedido**,
 * e dentro dela:
 *   1. um PAINEL fixado, reescrito a cada evento (estado atual do pedido);
 *   2. uma mensagem por EVENTO, empilhada (histórico do que aconteceu).
 *
 * Por que thread e não um canal por pedido (a ideia inicial): o Discord
 * limita 500 canais por servidor e 50 por categoria — a loja quebraria
 * sozinha depois de algumas centenas de vendas, e a barra lateral viraria
 * inutilizável muito antes disso. Thread dá o mesmo isolamento visual
 * ("um contêiner por pedido"), sem teto, com arquivamento automático e
 * busca nativa. O vínculo pedido → thread mora em `discord_order_threads`.
 *
 * GARANTIAS:
 *   • best-effort absoluto — NADA aqui pode derrubar um checkout, um webhook
 *     de pagamento ou um estorno já efetivado. Toda função engole o erro e
 *     loga; quem chama nunca precisa de try/catch;
 *   • idempotente — a Asaas reentrega webhook e o admin clica duas vezes.
 *     `last_event_key` impede o mesmo evento virar duas mensagens;
 *   • silencioso por padrão — sem as envs configuradas, é um no-op.
 */

type ThreadRow = {
  order_id: string
  thread_id: string
  dashboard_message_id: string | null
  last_status: string | null
  last_event_key: string | null
}

/**
 * Origem do evento, só para a assinatura do card ("via …"). Deixa óbvio no
 * canal se quem mexeu foi o gateway, o cron ou uma pessoa.
 */
export type DiscordOrderActor = "webhook-asaas" | "admin" | "cron" | "checkout" | "cliente"

const ACTOR_LABEL: Record<DiscordOrderActor, string> = {
  "webhook-asaas": "webhook Asaas",
  admin: "painel do admin",
  cron: "rotina automática",
  checkout: "checkout da loja",
  cliente: "ação do cliente",
}

export type NotifyDiscordOrderParams = {
  orderId: string
  status: OrderEventStatus
  actor: DiscordOrderActor
  /**
   * Discriminador opcional do evento. Entra em `last_event_key` junto com o
   * status, para eventos que se repetem sem mudar o status (estorno parcial
   * com valores diferentes, por exemplo).
   */
  eventKey?: string
  /** Detalhe livre exibido no card ("sem estoque para: Mouse X"). */
  note?: string | null
}

/**
 * Linha de `store_orders` no que o card precisa. Uma leitura só, com as
 * colunas explícitas — o card nunca recebe o pedido inteiro de quem chama,
 * justamente para não depender do que cada chamador tinha em mãos.
 */
const ORDER_COLUMNS =
  "id, status, total_cents, items, payment_method, customer_name, customer_email, created_at, " +
  "tracking_code, carrier, refunded_cents, refund_reason, asaas_payment_id, asaas_receipt_url, " +
  "affiliate_code, requires_shipping_address, is_sandbox, shipping_recipient, shipping_city, " +
  "shipping_state, shipping_postal_code"

function parseItems(raw: unknown): OrderCardItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>
    const quantity = Number(item.quantity)
    const unitPrice = Number(item.price_cents ?? item.unit_price_cents)
    return {
      name: typeof item.name === "string" ? item.name : "Item",
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unitPriceCents: Number.isFinite(unitPrice) ? unitPrice : null,
    }
  })
}

async function loadOrderCard(orderId: string): Promise<OrderCardData | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("store_orders").select(ORDER_COLUMNS).eq("id", orderId).maybeSingle()

  if (error || !data) {
    if (error) console.error("[discord-orders-repository] loadOrderCard:", error)
    return null
  }

  const row = data as unknown as Record<string, unknown>

  return {
    orderId: row.id as string,
    // Sobrescrito pelo status do evento em `notifyDiscordOrderEvent` —
    // eventos como chargeback não têm status próprio em `store_orders`.
    status: row.status as OrderEventStatus,
    totalCents: Number(row.total_cents ?? 0),
    paymentMethod: (row.payment_method as string | null) ?? null,
    customerName: (row.customer_name as string | null) ?? null,
    customerEmail: (row.customer_email as string | null) ?? null,
    items: parseItems(row.items),
    requiresShipping: Boolean(row.requires_shipping_address),
    isSandbox: Boolean(row.is_sandbox),
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    trackingCode: (row.tracking_code as string | null) ?? null,
    carrier: (row.carrier as string | null) ?? null,
    refundedCents: Number(row.refunded_cents ?? 0),
    refundReason: (row.refund_reason as string | null) ?? null,
    asaasPaymentId: (row.asaas_payment_id as string | null) ?? null,
    asaasReceiptUrl: (row.asaas_receipt_url as string | null) ?? null,
    affiliateCode: (row.affiliate_code as string | null) ?? null,
    shipping: {
      recipient: (row.shipping_recipient as string | null) ?? null,
      city: (row.shipping_city as string | null) ?? null,
      state: (row.shipping_state as string | null) ?? null,
      postalCode: (row.shipping_postal_code as string | null) ?? null,
    },
  }
}

/**
 * Devolve a thread do pedido, criando-a na primeira vez.
 *
 * O INSERT com `onConflict: order_id, ignoreDuplicates` resolve a corrida de
 * dois eventos simultâneos do mesmo pedido (checkout + webhook rápido): o
 * perdedor não sobrescreve a thread do vencedor, e relê a linha vencedora.
 * O custo é uma thread órfã e vazia no Discord nesse caso raro — muito
 * melhor que duas threads concorrentes recebendo metade dos eventos cada.
 */
async function ensureThread(config: DiscordConfig, data: OrderCardData): Promise<ThreadRow | null> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("discord_order_threads")
    .select("order_id, thread_id, dashboard_message_id, last_status, last_event_key")
    .eq("order_id", data.orderId)
    .maybeSingle()

  if (existing) return existing as ThreadRow

  const { threadId } = await createOrderThread({ config, name: threadName(data) })

  const { data: inserted, error } = await db
    .from("discord_order_threads")
    .upsert(
      { order_id: data.orderId, channel_id: config.ordersChannelId, thread_id: threadId },
      { onConflict: "order_id", ignoreDuplicates: true }
    )
    .select("order_id, thread_id, dashboard_message_id, last_status, last_event_key")
    .maybeSingle()

  if (error) {
    console.error("[discord-orders-repository] ensureThread — gravação:", error)
    return null
  }

  // `ignoreDuplicates` devolve vazio quando outro processo ganhou a corrida:
  // relemos para usar a thread dele (a nossa fica órfã, sem mensagem).
  if (!inserted) {
    const { data: winner } = await db
      .from("discord_order_threads")
      .select("order_id, thread_id, dashboard_message_id, last_status, last_event_key")
      .eq("order_id", data.orderId)
      .maybeSingle()
    return (winner as ThreadRow | null) ?? null
  }

  return inserted as ThreadRow
}

/**
 * Publica um evento de pedido no Discord. Ponto de entrada único — todo
 * chamador (webhook, cron, admin, checkout) usa só esta função.
 *
 * NUNCA lança e NUNCA precisa de `await` em caminho crítico: o valor de
 * retorno existe só para teste/diagnóstico.
 */
export async function notifyDiscordOrderEvent(
  params: NotifyDiscordOrderParams
): Promise<{ delivered: boolean; reason?: string }> {
  try {
    const config = getDiscordConfig()
    if (!config) return { delivered: false, reason: "discord desativado" }

    const loaded = await loadOrderCard(params.orderId)
    if (!loaded) return { delivered: false, reason: "pedido não encontrado" }

    // Pedido de sandbox é pagamento de mentira: por padrão não polui o canal
    // que a equipe usa para operar de verdade. `DISCORD_ORDERS_INCLUDE_SANDBOX=true`
    // liga, para quem quiser testar o fluxo inteiro antes de abrir a loja.
    if (loaded.isSandbox && !config.includeSandbox) {
      return { delivered: false, reason: "pedido de sandbox" }
    }

    // O status do EVENTO manda sobre o status da linha: `chargeback` e
    // `partial_refund` não existem em `store_orders`, e num estorno o card
    // deve falar do estorno mesmo que a linha já tenha sido reescrita.
    const data: OrderCardData = { ...loaded, status: params.status, note: params.note ?? null }

    const thread = await ensureThread(config, data)
    if (!thread) return { delivered: false, reason: "thread indisponível" }

    const eventKey = params.eventKey ? `${params.status}:${params.eventKey}` : params.status

    // Dedup: reentrega de webhook e clique duplo do admin chegam aqui como o
    // mesmo evento. Comparar com `last_event_key` (e não só com o status)
    // deixa passar um estorno parcial seguido de outro, que são eventos
    // distintos com o mesmo status.
    if (thread.last_event_key === eventKey) {
      return { delivered: false, reason: "evento duplicado" }
    }

    const previousStatus = (thread.last_status as OrderEventStatus | null) ?? null
    const buttons = buildLinkButtons(data)

    // Menção só quando há trabalho humano a fazer. Um canal que pinga em
    // tudo é um canal que ninguém lê — e aí o "pendente envio" se perde no
    // meio de dez "entregue".
    const mention =
      config.adminRoleId && isActionable(params.status) ? `<@&${config.adminRoleId}>` : undefined

    // 1) Painel: criado na primeira vez (e fixado), editado nas seguintes.
    let dashboardMessageId = thread.dashboard_message_id
    const dashboardPayload = {
      embeds: [buildDashboardEmbed(data)],
      linkButtons: buttons,
      allowedRoleIds: [] as string[],
    }

    if (dashboardMessageId) {
      try {
        await editMessage({
          config,
          channelId: thread.thread_id,
          messageId: dashboardMessageId,
          payload: dashboardPayload,
        })
      } catch (err) {
        // Mensagem apagada à mão no Discord: repostamos em vez de perder o
        // painel do pedido para sempre.
        console.error("[discord-orders-repository] painel — edição falhou, repostando:", err)
        dashboardMessageId = null
      }
    }

    if (!dashboardMessageId) {
      const created = await postMessage({
        config,
        channelId: thread.thread_id,
        payload: dashboardPayload,
      })
      dashboardMessageId = created.messageId
      // Fixar é cosmético: se falhar, o painel continua funcionando.
      await pinMessage({ config, channelId: thread.thread_id, messageId: dashboardMessageId }).catch(
        (err) => console.error("[discord-orders-repository] pin:", err)
      )
    }

    // 2) Evento: mensagem nova, o histórico da thread.
    await postMessage({
      config,
      channelId: thread.thread_id,
      payload: {
        content: mention,
        embeds: [
          buildEventEmbed({ data, previousStatus, actorLabel: ACTOR_LABEL[params.actor] }),
        ],
        allowedRoleIds: config.adminRoleId ? [config.adminRoleId] : [],
      },
    })

    // Só marca como publicado DEPOIS do envio: uma falha no meio faz o
    // próximo evento reenviar em vez de considerar entregue algo que não foi.
    const db = createSupabaseAdminClient()
    const { error } = await db
      .from("discord_order_threads")
      .update({
        dashboard_message_id: dashboardMessageId,
        last_status: params.status,
        last_event_key: eventKey,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", data.orderId)

    if (error) console.error("[discord-orders-repository] marca de entrega:", error)

    return { delivered: true }
  } catch (err) {
    // O contrato desta função é nunca lançar: um Discord fora do ar não pode
    // derrubar um pagamento confirmado.
    //
    // 403/404 não são "fora do ar": são configuração errada, e sem esse aviso
    // viram um stack trace idêntico em cada pedido, sem dizer o que fazer.
    if (err instanceof DiscordApiError && (err.status === 403 || err.status === 404)) {
      console.error(
        `[discord-orders-repository] Discord recusou (HTTP ${err.status}) — o bot não enxerga o canal ` +
          `${process.env.DISCORD_ORDERS_CHANNEL_ID}. Confira se ele foi convidado para o servidor e se tem ` +
          `Ver Canal + Enviar Mensagens + Criar Tópicos Públicos + Gerenciar Mensagens lá. ` +
          `Notificação de pedido ignorada; a Loja segue normal.`
      )
      return { delivered: false, reason: "discord sem acesso ao canal" }
    }

    console.error("[discord-orders-repository] notifyDiscordOrderEvent:", err)
    return { delivered: false, reason: "erro na publicação" }
  }
}

/**
 * Versão fire-and-forget para caminhos sensíveis a latência (webhook e
 * checkout). Retorna imediatamente; o `catch` existe só porque uma promise
 * rejeitada sem tratamento derruba o processo no Node.
 *
 * Cuidado: em serverless a função pode encerrar antes da promise resolver.
 * Use apenas onde a resposta rápida importa mais que a garantia de entrega —
 * nos webhooks da Asaas o `await` é preferível (eles toleram bem o tempo).
 */
export function notifyDiscordOrderEventInBackground(params: NotifyDiscordOrderParams): void {
  void notifyDiscordOrderEvent(params).catch((err) =>
    console.error("[discord-orders-repository] background:", err)
  )
}

/** Rótulo PT-BR de um status — reexportado para telas e scripts de teste. */
export function discordStatusLabel(status: OrderEventStatus): string {
  return statusStyle(status).label
}
