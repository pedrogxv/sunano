import "server-only"

import { formatBRL } from "@/lib/format"
import { orderNumber } from "@/lib/order-number"
import { absoluteUrl } from "@/lib/site-url"
import type { DiscordEmbed, DiscordLinkButton } from "@/lib/server/integrations/discord"

/**
 * Vocabulário visual das notificações de pedido no Discord.
 *
 * Separado do cliente REST de propósito: aqui não há I/O nenhum, só funções
 * puras que transformam um pedido em texto/cor/botão. Isso mantém o "como
 * fica bonito" longe do "como fala com a API", e deixa o card testável sem
 * rede.
 *
 * A ideia central é que quem olha o canal consiga responder em UM segundo:
 * "isso precisa de mim agora?". Por isso todo status carrega um `actionable`
 * — e só o que é acionável menciona o cargo de admin. Se tudo pingasse,
 * ninguém leria nada.
 */

export type OrderEventStatus =
  | "pending"
  | "paid"
  | "awaiting_shipping_info"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "expired"
  /** Não é um status de `store_orders` — é a disputa sinalizada em metadata. */
  | "chargeback"
  /** Estorno parcial: o pedido segue pago, mas houve devolução de valor. */
  | "partial_refund"
  /** Pagamento chegou depois da expiração e não havia estoque. */
  | "oversold"
  /** O valor confirmado na Asaas não bate com o total do pedido. */
  | "payment_mismatch"

type StatusStyle = {
  /** Emoji do título — é o que se lê primeiro na lista de threads. */
  emoji: string
  label: string
  /** Cor da barra lateral do embed. */
  color: number
  /** Frase curta que explica o que ACONTECEU, em PT-BR. */
  headline: string
  /**
   * O que o admin precisa fazer. `null` = nada, é só informativo.
   * Preenchido = o card ganha o bloco "Ação necessária" e menciona o cargo.
   */
  action: string | null
}

/** Verde do "pago", âmbar do "precisa de você", vermelho do "deu ruim". */
const COLORS = {
  slate: 0x64748b,
  green: 0x22c55e,
  amber: 0xf59e0b,
  blue: 0x3b82f6,
  violet: 0x8b5cf6,
  red: 0xef4444,
  rose: 0xf43f5e,
} as const

const STATUS_STYLE: Record<OrderEventStatus, StatusStyle> = {
  pending: {
    emoji: "🧾",
    label: "Aguardando pagamento",
    color: COLORS.slate,
    headline: "Pedido criado. O cliente ainda não pagou.",
    action: null,
  },
  paid: {
    emoji: "💚",
    label: "Pago",
    color: COLORS.green,
    headline: "Pagamento confirmado pela Asaas.",
    action: "Separe os itens e avance o pedido para **Aguardando dados de entrega**.",
  },
  awaiting_shipping_info: {
    emoji: "📮",
    label: "Aguardando envio",
    color: COLORS.amber,
    headline: "Pedido separado, esperando ser postado.",
    action: "Poste o pacote e registre **código de rastreio + transportadora** no admin.",
  },
  shipped: {
    emoji: "🚚",
    label: "Enviado",
    color: COLORS.blue,
    headline: "Pacote a caminho do cliente.",
    action: null,
  },
  delivered: {
    emoji: "🏁",
    label: "Entregue",
    color: COLORS.violet,
    headline: "Pedido concluído. Ciclo fechado.",
    action: null,
  },
  cancelled: {
    emoji: "🚫",
    label: "Cancelado",
    color: COLORS.slate,
    headline: "Pedido cancelado antes do pagamento. Estoque devolvido.",
    action: null,
  },
  expired: {
    emoji: "⌛",
    label: "Expirado",
    color: COLORS.slate,
    headline: "O prazo do PIX venceu sem pagamento. Estoque devolvido.",
    action: null,
  },
  refunded: {
    emoji: "↩️",
    label: "Estornado",
    color: COLORS.red,
    headline: "Estorno total processado.",
    action: "Confirme no painel da Asaas que o estorno saiu do saldo (o status lá só vira `DONE` depois da liquidação).",
  },
  partial_refund: {
    emoji: "🪙",
    label: "Estorno parcial",
    color: COLORS.rose,
    headline: "Parte do valor foi devolvida — o pedido continua ativo.",
    action: "Confirme o valor estornado no painel da Asaas e verifique se a entrega ainda deve acontecer.",
  },
  chargeback: {
    emoji: "⚠️",
    label: "Chargeback aberto",
    color: COLORS.red,
    headline: "O cliente abriu disputa no cartão. O status do pedido NÃO mudou.",
    action: "Reúna comprovantes (rastreio, conversa, nota) e responda a disputa na Asaas **dentro do prazo** — sem resposta a loja perde por padrão.",
  },
  oversold: {
    emoji: "🔥",
    label: "Pago sem estoque",
    color: COLORS.red,
    headline: "O pagamento entrou depois da expiração e o estoque já tinha sido vendido.",
    action: "Decida agora: repor o item, trocar por outro ou **estornar**. O cliente pagou por algo que a loja não tem.",
  },
  payment_mismatch: {
    emoji: "🧮",
    label: "Valor divergente",
    color: COLORS.red,
    headline: "A Asaas confirmou um valor diferente do total do pedido. O pedido NÃO foi liberado.",
    action: "Confira a cobrança no painel da Asaas. Se o valor estiver certo, libere o pedido manualmente; se não, trate como tentativa de fraude.",
  },
}

export function statusStyle(status: OrderEventStatus): StatusStyle {
  return STATUS_STYLE[status] ?? STATUS_STYLE.pending
}

export function isActionable(status: OrderEventStatus): boolean {
  return statusStyle(status).action !== null
}

/**
 * Linha do tempo desenhada com caracteres — a peça que faz o card render
 * "de relance". O status atual aparece preenchido, o que já passou fica
 * marcado, o que falta fica vazio.
 *
 * Pedido digital (`requires_shipping` false) pula `shipped`, exatamente
 * como `ORDER_DIGITAL_FULFILLMENT_FLOW` em `orders-repository.ts` — mostrar
 * um degrau "Enviado" que nunca vai acontecer confundiria mais que ajudaria.
 */
const FLOW_LABEL: Partial<Record<OrderEventStatus, string>> = {
  pending: "Pagamento",
  paid: "Pago",
  awaiting_shipping_info: "Separado",
  shipped: "Enviado",
  delivered: "Entregue",
}

export function renderTimeline(params: {
  status: OrderEventStatus
  requiresShipping: boolean
}): string {
  const flow: OrderEventStatus[] = params.requiresShipping
    ? ["pending", "paid", "awaiting_shipping_info", "shipped", "delivered"]
    : ["pending", "paid", "delivered"]

  // Estados terminais fora do fluxo feliz não têm posição na régua — a
  // trilha inteira aparece "interrompida" em vez de mentir um progresso.
  const terminal: OrderEventStatus[] = ["cancelled", "expired", "refunded"]
  if (terminal.includes(params.status)) {
    const style = statusStyle(params.status)
    return `\`━━━━━━━━━━━━━━━━\` ${style.emoji} **${style.label}**`
  }

  const currentIndex = flow.indexOf(params.status)
  // Chargeback / estorno parcial / oversold acontecem "por cima" de um
  // pedido pago: sem posição própria, mostramos a régua até `paid`.
  const activeIndex = currentIndex >= 0 ? currentIndex : flow.indexOf("paid")

  const track = flow
    .map((step, index) => {
      if (index < activeIndex) return "🟢"
      if (index === activeIndex) return "🔵"
      return "⚪"
    })
    .join("─")

  const label = FLOW_LABEL[flow[activeIndex]] ?? statusStyle(params.status).label
  return `${track}\n\`${label}\` — etapa ${activeIndex + 1} de ${flow.length}`
}

export type OrderCardItem = {
  name: string
  quantity: number
  unitPriceCents?: number | null
}

export type OrderCardData = {
  orderId: string
  status: OrderEventStatus
  totalCents: number
  /** Não-nulo = pedido pago com Aura (resgate de produto físico da Central). */
  auraCostPaid?: number | null
  paymentMethod: string | null
  customerName: string | null
  customerEmail: string | null
  items: OrderCardItem[]
  requiresShipping: boolean
  isSandbox: boolean
  createdAt: string
  trackingCode?: string | null
  carrier?: string | null
  refundedCents?: number | null
  refundReason?: string | null
  asaasPaymentId?: string | null
  asaasReceiptUrl?: string | null
  affiliateCode?: string | null
  shipping?: {
    recipient: string | null
    city: string | null
    state: string | null
    postalCode: string | null
  } | null
  /** Detalhe livre do evento (ex: itens sem estoque, motivo do cancelamento). */
  note?: string | null
}

/**
 * Escapa o que veio do cliente antes de entrar no Discord.
 *
 * Nome e e-mail são texto livre digitado por terceiros: sem isto, um nome
 * como `**@everyone**` ou um `[clique](http://phish)` viraria formatação e
 * link reais dentro do canal da equipe. Neutralizamos os caracteres de
 * markdown e as sequências de menção — o par com `allowed_mentions` no
 * cliente REST (que já barra o ping de fato) é defesa em profundidade:
 * aqui evitamos até a aparência enganosa.
 */
export function escapeDiscord(input: string | null | undefined, maxLength = 200): string {
  if (!input) return "—"
  return (
    input
      .slice(0, maxLength)
      // `[` e `]` entram na lista porque em `description` de embed o Discord
      // renderiza link mascarado — `[clique aqui](http://phishing)` viraria um
      // link real e enganoso assinado pela loja. Em `value` de field isso não
      // é interpretado, mas escapamos sempre: é o mesmo texto de origem
      // externa, e a diferença entre os dois campos é fácil de esquecer numa
      // edição futura.
      .replace(/[\\*_~`|>#[\]-]/g, (char) => `\\${char}`)
      .replace(/@(everyone|here)/gi, "@​$1")
      .replace(/<@/g, "<​@")
      .trim() || "—"
  )
}

const PAYMENT_LABEL: Record<string, string> = {
  pix: "PIX",
  card: "Cartão",
  credit_card: "Cartão",
  boleto: "Boleto",
  aura: "Aura ✨",
}

function paymentLabel(method: string | null): string {
  if (!method) return "—"
  return PAYMENT_LABEL[method.toLowerCase()] ?? escapeDiscord(method, 40)
}

/** Valor do pedido para o Discord: custo em Aura quando for resgate da Central, senão BRL. */
function orderValueLabel(data: Pick<OrderCardData, "paymentMethod" | "totalCents" | "auraCostPaid">): string {
  if (data.paymentMethod === "aura") {
    return `✨ ${(data.auraCostPaid ?? 0).toLocaleString("pt-BR")} Aura`
  }
  return formatBRL(data.totalCents)
}

/** Nome da thread. É a única coisa visível na lista lateral do Discord. */
export function threadName(data: OrderCardData): string {
  const style = statusStyle(data.status)
  const total = orderValueLabel(data)
  const sandbox = data.isSandbox ? "🧪 " : ""
  // Sem escapeDiscord: nome de thread é texto puro, o Discord não formata.
  const customer = (data.customerName ?? "convidado").slice(0, 24)
  return `${sandbox}${style.emoji} #${orderNumber(data.orderId)} · ${total} · ${customer}`
}

function itemLines(items: OrderCardItem[]): string {
  if (items.length === 0) return "—"

  const shown = items.slice(0, 8).map((item) => {
    const price = item.unitPriceCents ? ` · ${formatBRL(item.unitPriceCents)}` : ""
    return `\`${item.quantity}×\` ${escapeDiscord(item.name, 70)}${price}`
  })

  if (items.length > 8) shown.push(`_…e mais ${items.length - 8} item(ns)_`)
  // Limite duro de 1024 caracteres por field de embed.
  return shown.join("\n").slice(0, 1000)
}

/**
 * O PAINEL: uma mensagem fixada no topo da thread, reescrita a cada evento.
 * É o retrato atual do pedido — quem abre a thread depois de 5 eventos vê o
 * estado de agora aqui em cima, e o histórico logo abaixo.
 */
export function buildDashboardEmbed(data: OrderCardData): DiscordEmbed {
  const style = statusStyle(data.status)
  const fields: DiscordEmbed["fields"] = []

  fields.push({
    name: "Situação",
    value: `${style.emoji} **${style.label}**\n${renderTimeline({ status: data.status, requiresShipping: data.requiresShipping })}`,
  })

  fields.push(
    { name: "Total", value: `**${orderValueLabel(data)}**`, inline: true },
    { name: "Pagamento", value: paymentLabel(data.paymentMethod), inline: true },
    { name: "Entrega", value: data.requiresShipping ? "Física 📦" : "Digital ⚡", inline: true }
  )

  fields.push({
    name: "Cliente",
    value: `${escapeDiscord(data.customerName, 60)}\n\`${escapeDiscord(data.customerEmail, 80)}\``,
    inline: true,
  })

  if (data.shipping?.city) {
    const place = [data.shipping.city, data.shipping.state].filter(Boolean).join("/")
    fields.push({
      name: "Destino",
      value: `${escapeDiscord(data.shipping.recipient, 50)}\n${escapeDiscord(place, 50)} · \`${escapeDiscord(data.shipping.postalCode, 12)}\``,
      inline: true,
    })
  } else if (data.requiresShipping) {
    fields.push({ name: "Destino", value: "⚠️ _endereço ainda não informado_", inline: true })
  }

  if (data.affiliateCode) {
    fields.push({ name: "Afiliado", value: `\`${escapeDiscord(data.affiliateCode, 32)}\``, inline: true })
  }

  fields.push({ name: `Itens (${data.items.length})`, value: itemLines(data.items) })

  if (data.trackingCode) {
    fields.push({
      name: "Rastreio",
      value: `\`${escapeDiscord(data.trackingCode, 40)}\`${data.carrier ? ` · ${escapeDiscord(data.carrier, 30)}` : ""}`,
      inline: true,
    })
  }

  if (data.refundedCents && data.refundedCents > 0) {
    fields.push({
      name: "Estornado",
      value: `**${formatBRL(data.refundedCents)}**${data.refundReason ? `\n_${escapeDiscord(data.refundReason, 100)}_` : ""}`,
      inline: true,
    })
  }

  return {
    title: `${data.isSandbox ? "🧪 [SANDBOX] " : ""}Pedido #${orderNumber(data.orderId)}`,
    url: absoluteUrl(`/admin/store/orders?q=${orderNumber(data.orderId)}`),
    color: style.color,
    fields,
    footer: {
      text: data.isSandbox
        ? "PEDIDO DE TESTE — nenhum dinheiro real envolvido"
        : `Criado em ${new Date(data.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    },
    timestamp: new Date().toISOString(),
  }
}

/**
 * O EVENTO: mensagem nova a cada transição, empilhada na thread. Curta de
 * propósito — o painel acima já tem o detalhe; aqui só interessa "o que
 * mudou agora e o que eu faço a respeito".
 */
export function buildEventEmbed(params: {
  data: OrderCardData
  previousStatus: OrderEventStatus | null
  actorLabel: string
}): DiscordEmbed {
  const { data, previousStatus, actorLabel } = params
  const style = statusStyle(data.status)

  const transition = previousStatus
    ? `\`${statusStyle(previousStatus).label}\` → \`${style.label}\``
    : `\`${style.label}\``

  const parts = [`${transition}\n${style.headline}`]

  if (data.note) parts.push(`\n📎 ${escapeDiscord(data.note, 400)}`)

  if (style.action) {
    parts.push(`\n### ⚡ Ação necessária\n${style.action}`)
  }

  return {
    title: `${style.emoji} ${style.label}`,
    description: parts.join("\n"),
    color: style.color,
    footer: { text: `via ${actorLabel}` },
    timestamp: new Date().toISOString(),
  }
}

/**
 * Botões de link do card. Sempre levam para onde a ação acontece — o ponto
 * é que ninguém precise caçar o pedido no admin depois de ler a notificação.
 */
export function buildLinkButtons(data: OrderCardData): DiscordLinkButton[] {
  const buttons: DiscordLinkButton[] = [
    {
      label: "Abrir no admin",
      url: absoluteUrl(`/admin/store/orders?q=${orderNumber(data.orderId)}`),
      emoji: { name: "🛠️" },
    },
  ]

  if (data.asaasPaymentId) {
    // O painel da Asaas não expõe deep link estável por id de cobrança; o
    // link leva à listagem de cobranças e o id fica no card para busca.
    buttons.push({ label: "Painel Asaas", url: "https://www.asaas.com/paymentsLoggedIn", emoji: { name: "🏦" } })
  }

  if (data.asaasReceiptUrl) {
    buttons.push({ label: "Comprovante", url: data.asaasReceiptUrl, emoji: { name: "🧾" } })
  }

  if (data.trackingCode) {
    buttons.push({
      label: "Rastrear",
      url: `https://www.linkcorreios.com.br/?id=${encodeURIComponent(data.trackingCode)}`,
      emoji: { name: "📍" },
    })
  }

  return buttons
}
