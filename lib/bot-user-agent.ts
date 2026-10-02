/**
 * Detecção de bot por User-Agent — módulo puro (sem `server-only`): o proxy
 * e qualquer rota podem importar.
 *
 * Existe por causa do IO do banco, não por segurança: crawler não guarda
 * cookie, então o `sn_visit_tracked` do proxy não o segura e cada hit dele
 * virava um INSERT em `site_visits`. Eram ~3.300 INSERTs/dia para ~400 linhas
 * — ~88% descartados pelo `on conflict`, mas um `on conflict do nothing`
 * escreve no WAL e no índice ANTES de detectar o conflito, então o trabalho
 * de disco acontece de qualquer forma. Foi o que esgotou o Disk IO Budget.
 *
 * Não é uma trava de acesso: um bot que minta o User-Agent passa, e isso é
 * aceitável — o pior caso é uma linha a mais no contador do dashboard, nunca
 * um acesso indevido. Por isso é lista de substring, não fingerprint.
 */

/**
 * Minúsculas, comparadas como substring. Cobre os buscadores, os
 * pré-visualizadores de link (que batem na página quando alguém cola a URL
 * no WhatsApp/Discord/Slack) e as bibliotecas de requisição mais comuns.
 */
const BOT_UA_PATTERNS = [
  // Genéricos — pegam a maioria dos crawlers bem-comportados.
  "bot",
  "spider",
  "crawler",
  "crawling",
  // Buscadores e indexadores que não casam nos genéricos acima.
  "googlebot",
  "google-inspectiontool",
  "bingbot",
  "yandex",
  "baiduspider",
  "duckduckbot",
  "slurp",
  "applebot",
  // Pré-visualização de link em apps de mensagem.
  "facebookexternalhit",
  "whatsapp",
  "telegrambot",
  "discordbot",
  "slackbot",
  "twitterbot",
  "linkedinbot",
  "embedly",
  "skypeuripreview",
  // Ferramentas de auditoria e monitoramento.
  "lighthouse",
  "pagespeed",
  "gtmetrix",
  "pingdom",
  "uptimerobot",
  "ahrefs",
  "semrush",
  "mj12bot",
  "dotbot",
  "petalbot",
  // Clientes de requisição: nunca são navegação de pessoa.
  "curl/",
  "wget",
  "python-requests",
  "python-httpx",
  "go-http-client",
  "axios/",
  "node-fetch",
  "okhttp",
  "java/",
  "headlesschrome",
  // IA / assistentes que rastreiam páginas.
  "gptbot",
  "oai-searchbot",
  "chatgpt-user",
  "claudebot",
  "anthropic-ai",
  "perplexitybot",
  "ccbot",
  "bytespider",
] as const

/**
 * `true` para User-Agent de bot, e também para ausente/vazio: navegador de
 * pessoa sempre manda o header, então um GET de página sem ele é cliente
 * automatizado.
 */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true

  const ua = userAgent.toLowerCase()
  return BOT_UA_PATTERNS.some((pattern) => ua.includes(pattern))
}
