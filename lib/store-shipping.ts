/**
 * Frete e prazo de entrega da Loja. Módulo puro: o card, a página do produto,
 * o carrinho e o checkout leem DAQUI, para "15 dias úteis" ser o mesmo número
 * em toda tela.
 *
 * Frete grátis não é promoção, é o modelo: o checkout não cobra frete (o
 * total do pedido é só a soma dos itens). Se um dia o frete passar a ser
 * cobrado, é aqui que a vitrine para de anunciar, junto com a mudança no
 * checkout. Produto sem envio (serviço, item do site) não tem frete nenhum,
 * então também não anuncia "frete grátis".
 */

/** Prazo de entrega anunciado, em dias úteis, contado da confirmação do pagamento. */
export const STORE_DELIVERY_BUSINESS_DAYS = 15

/** O produto vai pelo correio? `requires_shipping` ausente conta como físico, igual ao checkout. */
export function hasFreeShipping(product: { requires_shipping?: boolean | null }): boolean {
  return product.requires_shipping !== false
}

// ────────────────────────────────────────────
// Dias úteis
// ────────────────────────────────────────────

/** Data civil (sem hora) em `YYYY-MM-DD`. Toda a conta é feita sobre ela, nunca sobre `Date` com fuso. */
export type DateKey = string

/**
 * Hoje no horário de Brasília. A Loja opera no Brasil: usar o fuso do
 * navegador (ou UTC no servidor) fazia o contador de visitas virar o dia às
 * 21h, e aqui faria a previsão andar um dia antes da hora.
 */
export function todayKeySaoPaulo(now: Date = new Date()): DateKey {
  // `en-CA` formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now)
}

/** Meio-dia UTC da data: somar dias nunca cruza fronteira de fuso nem horário de verão. */
function keyToUtcNoon(key: DateKey): Date {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

function utcToKey(date: Date): DateKey {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), meio-dia UTC. */
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day, 12))
}

const FIXED_HOLIDAYS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"]

const holidayCache = new Map<number, Set<DateKey>>()

/**
 * Feriados nacionais do ano. Carnaval e Corpus Christi são ponto facultativo,
 * mas transportadora e Correios param: entram na conta. O erro aqui só pode
 * ir para um lado, o de prometer um dia DEPOIS; prometer antes e atrasar é o
 * que vira reclamação.
 */
function nationalHolidays(year: number): Set<DateKey> {
  const cached = holidayCache.get(year)
  if (cached) return cached
  const easter = easterSunday(year)
  const set = new Set<DateKey>([
    ...FIXED_HOLIDAYS.map((monthDay) => `${year}-${monthDay}`),
    utcToKey(addDays(easter, -48)), // segunda de Carnaval
    utcToKey(addDays(easter, -47)), // terça de Carnaval
    utcToKey(addDays(easter, -2)), // Sexta-feira Santa
    utcToKey(addDays(easter, 60)), // Corpus Christi
  ])
  holidayCache.set(year, set)
  return set
}

export function isBusinessDay(key: DateKey): boolean {
  const date = keyToUtcNoon(key)
  const weekday = date.getUTCDay()
  if (weekday === 0 || weekday === 6) return false
  return !nationalHolidays(date.getUTCFullYear()).has(key)
}

/** `from` + N dias úteis. O próprio `from` não conta: pagou hoje, o dia 1 é o próximo dia útil. */
export function addBusinessDays(from: DateKey, businessDays: number): DateKey {
  let date = keyToUtcNoon(from)
  let remaining = businessDays
  while (remaining > 0) {
    date = addDays(date, 1)
    if (isBusinessDay(utcToKey(date))) remaining -= 1
  }
  return utcToKey(date)
}

/** Último dia da previsão de entrega para quem paga hoje. */
export function deliveryDeadline(today: DateKey, businessDays = STORE_DELIVERY_BUSINESS_DAYS): DateKey {
  return addBusinessDays(today, businessDays)
}

/** "sex., 23 de out." */
export function formatDeliveryDate(key: DateKey): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    keyToUtcNoon(key)
  )
}
