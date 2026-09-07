import "server-only"

/**
 * Cliente REST do Discord — SERVIDOR APENAS.
 *
 * Usa `DISCORD_BOT_TOKEN`, que jamais pode chegar ao navegador. Só o que a
 * notificação de pedidos precisa: criar thread, postar, editar e fixar
 * mensagem. Nada de gateway/websocket — o bot não escuta nada, só publica.
 *
 * Docs: https://discord.com/developers/docs/resources/channel
 *
 * DESLIGADO POR PADRÃO: sem `DISCORD_BOT_TOKEN` + `DISCORD_ORDERS_CHANNEL_ID`
 * toda função vira no-op. Isso é deliberado — a Loja precisa funcionar
 * exatamente igual com o Discord fora do ar, em dev local e antes de você
 * colar as credenciais.
 */

const API_BASE = "https://discord.com/api/v10"

/** Timeout curto: notificação nunca pode segurar a resposta de um checkout. */
const REQUEST_TIMEOUT_MS = 8000

export type DiscordConfig = {
  token: string
  ordersChannelId: string
  /** Cargo marcado quando o pedido exige ação humana. Opcional. */
  adminRoleId: string | null
  /** Publica também pedidos de sandbox (pagamento de teste). Padrão: não. */
  includeSandbox: boolean
}

/**
 * Lê e valida a configuração. Retorna `null` (em vez de lançar) quando o
 * Discord não está configurado: o chamador trata isso como "recurso
 * desligado", não como erro.
 */
export function getDiscordConfig(): DiscordConfig | null {
  const token = process.env.DISCORD_BOT_TOKEN?.trim()
  const ordersChannelId = process.env.DISCORD_ORDERS_CHANNEL_ID?.trim()

  if (!token || !ordersChannelId) return null

  return {
    token,
    ordersChannelId,
    adminRoleId: process.env.DISCORD_ADMIN_ROLE_ID?.trim() || null,
    includeSandbox: process.env.DISCORD_ORDERS_INCLUDE_SANDBOX === "true",
  }
}

export function isDiscordEnabled(): boolean {
  return getDiscordConfig() !== null
}

/**
 * Componentes de mensagem que usamos (subconjunto tipado do que o Discord
 * aceita). Embed é o cartão colorido; a barra de botões é `ActionRow` com
 * botões do tipo link — botão de link não precisa de interação registrada,
 * então o bot não precisa de servidor de comandos nem responder a nada.
 */
export type DiscordEmbedField = { name: string; value: string; inline?: boolean }

export type DiscordEmbed = {
  title?: string
  description?: string
  url?: string
  color?: number
  fields?: DiscordEmbedField[]
  footer?: { text: string }
  thumbnail?: { url: string }
  timestamp?: string
  author?: { name: string; icon_url?: string }
}

export type DiscordLinkButton = { label: string; url: string; emoji?: { name: string } }

export type DiscordMessagePayload = {
  content?: string
  embeds?: DiscordEmbed[]
  /** Vira uma ActionRow de botões de link. Máximo 5. */
  linkButtons?: DiscordLinkButton[]
  /** Quem pode ser mencionado de verdade (o resto vira texto inerte). */
  allowedRoleIds?: string[]
}

function buildBody(payload: DiscordMessagePayload): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (payload.content) body.content = payload.content
  if (payload.embeds?.length) body.embeds = payload.embeds

  if (payload.linkButtons?.length) {
    body.components = [
      {
        type: 1, // ActionRow
        components: payload.linkButtons.slice(0, 5).map((button) => ({
          type: 2, // Button
          style: 5, // Link — não gera interação, o bot não precisa responder
          label: button.label.slice(0, 80),
          url: button.url,
          ...(button.emoji ? { emoji: button.emoji } : {}),
        })),
      },
    ]
  }

  // Sem isto, um `@everyone` que vazasse para dentro de um nome de cliente
  // pingaria o servidor inteiro. A allow-list explícita deixa passar só os
  // cargos que NÓS escolhemos mencionar; qualquer outra menção vira texto.
  body.allowed_mentions = { parse: [], roles: payload.allowedRoleIds ?? [] }

  return body
}

/**
 * Erro de chamada ao Discord com o status preservado. O chamador precisa
 * distinguir "Discord fora do ar" (transitório, o próximo evento resolve) de
 * 403/404, que são SEMPRE configuração — bot fora do servidor, canal errado
 * ou permissão negada — e vão repetir em todo pedido até alguém arrumar.
 */
export class DiscordApiError extends Error {
  readonly status: number

  constructor(method: string, path: string, status: number, detail: string) {
    super(`Discord ${method} ${path} → HTTP ${status} ${detail.slice(0, 300)}`)
    this.name = "DiscordApiError"
    this.status = status
  }
}

type DiscordRequestOptions = {
  method: "GET" | "POST" | "PATCH" | "PUT"
  path: string
  body?: unknown
  token: string
}

/**
 * Uma requisição ao Discord, com um retry para os dois casos em que tentar de
 * novo resolve: rate limit (429, o Discord informa `retry_after`) e erro 5xx
 * do lado deles. Qualquer outro status (403 sem permissão, 404 canal errado)
 * é definitivo — repetir só gastaria tempo do request do cliente.
 */
async function discordRequest<T>(options: DiscordRequestOptions): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${API_BASE}${options.path}`, {
      method: options.method,
      headers: {
        Authorization: `Bot ${options.token}`,
        "Content-Type": "application/json",
        "User-Agent": "SunanoOrders (https://sunano.com.br, 1.0)",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    })

    if (response.ok) {
      return (await response.json().catch(() => ({}))) as T
    }

    const retryable = response.status === 429 || response.status >= 500
    if (!retryable || attempt === 1) {
      const detail = await response.text().catch(() => "")
      throw new DiscordApiError(options.method, options.path, response.status, detail)
    }

    // O Discord manda `retry_after` em segundos no corpo do 429.
    const payload = (await response.json().catch(() => null)) as { retry_after?: number } | null
    const waitMs = Math.min((payload?.retry_after ?? 1) * 1000, 5000)
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }

  throw new Error(`Discord ${options.method} ${options.path} — esgotou as tentativas`)
}

type DiscordMessage = { id: string; channel_id: string }

/**
 * Cria uma thread SEM mensagem inicial no canal de pedidos.
 *
 * `type: 11` é PUBLIC_THREAD; `auto_archive_duration` em minutos (10080 = 7
 * dias) só esconde a thread da lista ativa — ela continua existindo e
 * aceitando mensagem, que reativa a thread automaticamente. Ou seja: um
 * pedido entregue 3 semanas depois ainda cai na thread certa.
 */
export async function createOrderThread(params: {
  config: DiscordConfig
  name: string
}): Promise<{ threadId: string }> {
  const thread = await discordRequest<{ id: string }>({
    method: "POST",
    path: `/channels/${params.config.ordersChannelId}/threads`,
    token: params.config.token,
    body: {
      name: params.name.slice(0, 100),
      type: 11,
      auto_archive_duration: 10080,
    },
  })

  return { threadId: thread.id }
}

export async function postMessage(params: {
  config: DiscordConfig
  channelId: string
  payload: DiscordMessagePayload
}): Promise<{ messageId: string }> {
  const message = await discordRequest<DiscordMessage>({
    method: "POST",
    path: `/channels/${params.channelId}/messages`,
    token: params.config.token,
    body: buildBody(params.payload),
  })

  return { messageId: message.id }
}

/**
 * Edita uma mensagem já postada. É o que mantém UM painel do pedido sempre
 * atualizado no topo da thread, em vez de N cópias desatualizadas.
 */
export async function editMessage(params: {
  config: DiscordConfig
  channelId: string
  messageId: string
  payload: DiscordMessagePayload
}): Promise<void> {
  await discordRequest({
    method: "PATCH",
    path: `/channels/${params.channelId}/messages/${params.messageId}`,
    token: params.config.token,
    body: buildBody(params.payload),
  })
}

/** Fixa a mensagem-painel para ela ficar acessível no topo da thread. */
export async function pinMessage(params: {
  config: DiscordConfig
  channelId: string
  messageId: string
}): Promise<void> {
  await discordRequest({
    method: "PUT",
    path: `/channels/${params.channelId}/pins/${params.messageId}`,
    token: params.config.token,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificação de participação no servidor (conquista "No Discord")
//
// Independente do bot de pedidos acima: não usa `DISCORD_BOT_TOKEN` nem
// `getDiscordConfig()`. Aqui quem autentica é O USUÁRIO, com o access token
// OAuth que ele acabou de emitir ao consentir o escopo `guilds` — por isso
// funciona sem nenhuma permissão nova do bot e sem privileged intent
// (`GUILD_MEMBERS`), que é o que a rota de bot `/guilds/{id}/members/{user}`
// exigiria. Ver app/auth/discord/callback/route.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** ID do servidor oficial cuja participação vale a conquista. */
export function getDiscordGuildId(): string | null {
  return process.env.DISCORD_GUILD_ID?.trim() || null
}

type DiscordGuildSummary = { id: string }

/**
 * Confere se o dono do `accessToken` é membro de `guildId`.
 *
 * `GET /users/@me/guilds` devolve APENAS as guilds do próprio usuário, e só
 * com o escopo `guilds` consentido — não dá para consultar terceiros com
 * isto, então não é uma via de vazamento de quem está no servidor.
 *
 * O token é usado só aqui, dentro da requisição do callback, e nunca
 * persistido (mesma postura do `provider_token` do YouTube).
 */
export async function isMemberOfGuild(params: {
  accessToken: string
  guildId: string
}): Promise<boolean> {
  const response = await fetch(`${API_BASE}/users/@me/guilds`, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "User-Agent": "SunanoOrders (https://sunano.com.br, 1.0)",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new DiscordApiError("GET", "/users/@me/guilds", response.status, detail)
  }

  const guilds = (await response.json()) as DiscordGuildSummary[]
  return Array.isArray(guilds) && guilds.some((guild) => guild.id === params.guildId)
}
