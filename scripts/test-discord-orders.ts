import fs from "node:fs"
import path from "node:path"

/**
 * Teste manual da notificação de pedidos no Discord, SEM precisar de um
 * pedido real mudando de status.
 *
 * Publica uma thread de demonstração com um pedido fictício e desfila todos
 * os status por ela — inclusive os que só acontecem no pior dia da loja
 * (chargeback, estorno parcial, pago sem estoque), que são justamente os
 * que você nunca vai querer testar com dinheiro de verdade.
 *
 * Reimplementa a montagem do card em vez de importar
 * `discord-orders-repository`: aquele módulo é `server-only` (não roda fora
 * do Next.js) e escreve em `discord_order_threads`. Aqui não tocamos no
 * banco — a thread de teste é descartável e não vira estado de pedido nenhum.
 *
 * Uso:
 *   npx tsx scripts/test-discord-orders.ts
 *   npx tsx scripts/test-discord-orders.ts --status=chargeback
 */

function readEnvFileValue(key: string): string {
  try {
    const envPath = path.join(process.cwd(), ".env.local")
    const contents = fs.readFileSync(envPath, "utf8")
    const line = contents.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`))
    if (!line) return ""
    return line.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, "")
  } catch {
    return ""
  }
}

function env(key: string): string {
  return (process.env[key] || readEnvFileValue(key)).trim()
}

const API_BASE = "https://discord.com/api/v10"

const TOKEN = env("DISCORD_BOT_TOKEN")
const CHANNEL_ID = env("DISCORD_ORDERS_CHANNEL_ID")
const ROLE_ID = env("DISCORD_ADMIN_ROLE_ID")

const ALL_STATUSES = [
  "pending",
  "paid",
  "awaiting_shipping_info",
  "shipped",
  "delivered",
  "partial_refund",
  "refunded",
  "chargeback",
  "oversold",
  "expired",
  "cancelled",
] as const

type Status = (typeof ALL_STATUSES)[number]

const STYLE: Record<Status, { emoji: string; label: string; color: number; headline: string; action: string | null }> = {
  pending: { emoji: "🧾", label: "Aguardando pagamento", color: 0x64748b, headline: "Pedido criado. O cliente ainda não pagou.", action: null },
  paid: { emoji: "💚", label: "Pago", color: 0x22c55e, headline: "Pagamento confirmado pela Asaas.", action: "Separe os itens e avance o pedido para **Aguardando dados de entrega**." },
  awaiting_shipping_info: { emoji: "📮", label: "Aguardando envio", color: 0xf59e0b, headline: "Pedido separado, esperando ser postado.", action: "Poste o pacote e registre **código de rastreio + transportadora** no admin." },
  shipped: { emoji: "🚚", label: "Enviado", color: 0x3b82f6, headline: "Pacote a caminho do cliente.", action: null },
  delivered: { emoji: "🏁", label: "Entregue", color: 0x8b5cf6, headline: "Pedido concluído. Ciclo fechado.", action: null },
  cancelled: { emoji: "🚫", label: "Cancelado", color: 0x64748b, headline: "Pedido cancelado antes do pagamento. Estoque devolvido.", action: null },
  expired: { emoji: "⌛", label: "Expirado", color: 0x64748b, headline: "O prazo do PIX venceu sem pagamento. Estoque devolvido.", action: null },
  refunded: { emoji: "↩️", label: "Estornado", color: 0xef4444, headline: "Estorno total processado.", action: "Confirme no painel da Asaas que o estorno saiu do saldo." },
  partial_refund: { emoji: "🪙", label: "Estorno parcial", color: 0xf43f5e, headline: "Parte do valor foi devolvida — o pedido continua ativo.", action: "Confirme o valor estornado no painel da Asaas." },
  chargeback: { emoji: "⚠️", label: "Chargeback aberto", color: 0xef4444, headline: "O cliente abriu disputa no cartão.", action: "Reúna comprovantes e responda a disputa na Asaas **dentro do prazo**." },
  oversold: { emoji: "🔥", label: "Pago sem estoque", color: 0xef4444, headline: "O pagamento entrou depois da expiração e o estoque já tinha sido vendido.", action: "Decida agora: repor, trocar ou **estornar**." },
}

async function discord<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`Discord ${method} ${endpoint} → HTTP ${response.status} ${await response.text()}`)
  }
  return (await response.json().catch(() => ({}))) as T
}

function timeline(status: Status): string {
  const flow: Status[] = ["pending", "paid", "awaiting_shipping_info", "shipped", "delivered"]
  if (["cancelled", "expired", "refunded"].includes(status)) {
    return `\`━━━━━━━━━━━━━━━━\` ${STYLE[status].emoji} **${STYLE[status].label}**`
  }
  const index = flow.indexOf(status) >= 0 ? flow.indexOf(status) : flow.indexOf("paid")
  const track = flow.map((_, i) => (i < index ? "🟢" : i === index ? "🔵" : "⚪")).join("─")
  return `${track}\n\`${STYLE[flow[index]].label}\` — etapa ${index + 1} de ${flow.length}`
}

function dashboardEmbed(status: Status) {
  return {
    title: "🧪 [TESTE] Pedido #DEMO0001",
    color: STYLE[status].color,
    fields: [
      { name: "Situação", value: `${STYLE[status].emoji} **${STYLE[status].label}**\n${timeline(status)}` },
      { name: "Total", value: "**R$ 349,90**", inline: true },
      { name: "Pagamento", value: "PIX", inline: true },
      { name: "Entrega", value: "Física 📦", inline: true },
      { name: "Cliente", value: "Fulano de Teste\n`teste@exemplo.com`", inline: true },
      { name: "Destino", value: "Fulano de Teste\nSão Paulo/SP · `01310-100`", inline: true },
      { name: "Itens (2)", value: "`1×` Mouse Gamer XPTO · R$ 249,90\n`1×` Mousepad Speed · R$ 100,00" },
    ],
    footer: { text: "PEDIDO DE TESTE — gerado por scripts/test-discord-orders.ts" },
    timestamp: new Date().toISOString(),
  }
}

function eventEmbed(status: Status, previous: Status | null) {
  const style = STYLE[status]
  const transition = previous ? `\`${STYLE[previous].label}\` → \`${style.label}\`` : `\`${style.label}\``
  const parts = [`${transition}\n${style.headline}`]
  if (style.action) parts.push(`\n### ⚡ Ação necessária\n${style.action}`)
  return {
    title: `${style.emoji} ${style.label}`,
    description: parts.join("\n"),
    color: style.color,
    footer: { text: "via teste manual" },
    timestamp: new Date().toISOString(),
  }
}

async function main() {
  if (!TOKEN || !CHANNEL_ID) {
    console.error(
      "❌ DISCORD_BOT_TOKEN e DISCORD_ORDERS_CHANNEL_ID são obrigatórias (ambiente ou .env.local).\n" +
        "   Veja o passo a passo no .env.example."
    )
    process.exit(1)
  }

  const only = process.argv.slice(2).find((a) => a.startsWith("--status="))?.split("=")[1] as Status | undefined
  if (only && !ALL_STATUSES.includes(only)) {
    console.error(`❌ Status inválido: ${only}\n   Válidos: ${ALL_STATUSES.join(", ")}`)
    process.exit(1)
  }
  const sequence: Status[] = only ? [only] : [...ALL_STATUSES]

  console.log(`🧵 Criando thread de teste no canal ${CHANNEL_ID}…`)
  const thread = await discord<{ id: string }>("POST", `/channels/${CHANNEL_ID}/threads`, {
    name: `🧪 TESTE · #DEMO0001 · R$ 349,90 · Fulano`,
    type: 11,
    auto_archive_duration: 1440,
  })
  console.log(`   thread ${thread.id}`)

  const panel = await discord<{ id: string }>("POST", `/channels/${thread.id}/messages`, {
    embeds: [dashboardEmbed(sequence[0])],
    allowed_mentions: { parse: [] },
  })
  await discord("PUT", `/channels/${thread.id}/pins/${panel.id}`).catch(() =>
    console.warn("   ⚠️  não consegui fixar (falta a permissão Manage Messages?)")
  )
  console.log("   painel fixado")

  let previous: Status | null = null
  for (const status of sequence) {
    await discord("PATCH", `/channels/${thread.id}/messages/${panel.id}`, {
      embeds: [dashboardEmbed(status)],
      allowed_mentions: { parse: [] },
    })
    await discord("POST", `/channels/${thread.id}/messages`, {
      content: ROLE_ID && STYLE[status].action ? `<@&${ROLE_ID}>` : undefined,
      embeds: [eventEmbed(status, previous)],
      allowed_mentions: { parse: [], roles: ROLE_ID ? [ROLE_ID] : [] },
    })
    console.log(`   ${STYLE[status].emoji} ${status}`)
    previous = status
    // Respiro entre mensagens para não bater no rate limit do canal.
    await new Promise((resolve) => setTimeout(resolve, 700))
  }

  console.log("\n✅ Pronto. Abra a thread no Discord e confira o visual.")
  console.log("   Apague a thread de teste depois (botão direito > Excluir Thread).")
}

main().catch((err) => {
  console.error("❌", err instanceof Error ? err.message : err)
  process.exit(1)
})
