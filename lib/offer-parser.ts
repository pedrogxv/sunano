/**
 * Parser das mensagens de oferta vindas do Telegram.
 *
 * O canal não tem formato estruturado — é texto livre digitado à mão. O que
 * existe é um *padrão de escrita* razoavelmente estável, com emoji marcando
 * cada linha:
 *
 *   🔥🔥 Cadeira Ergonômica de Malha Respirável (cinza)
 *
 *   💵 R$ 609 no Pix
 *   💵 R$ 644 em 12x sem juros
 *
 *   🏷 Cupom: 9DO9TADEMAIS
 *
 *   🔗 https://amzn.to/4AljHrF
 *
 * A extração aqui é toda best-effort: quando um campo não casa, ele volta
 * `null` e a UI cai no texto cru. Nada aqui pode derrubar a renderização de
 * uma oferta que fuja do padrão.
 */

export type OfferPrice = {
  /** Valor formatado como veio na mensagem, ex.: "R$ 609". */
  label: string
  /** Valor numérico em reais, para ordenar/comparar. `null` se não deu pra ler. */
  value: number | null
  /** Resto da linha depois do preço, ex.: "no Pix" ou "em 12x sem juros". */
  note: string | null
  /** `true` quando a linha menciona Pix/à vista/boleto. */
  isPix: boolean
  /** Número de parcelas quando a linha é de parcelamento ("12x" → 12). */
  installments: number | null
}

export type ParsedOffer = {
  /** Primeira linha significativa, sem os emoji de destaque. */
  title: string | null
  /** Cupons encontrados, sem duplicatas, na ordem em que aparecem. */
  coupons: string[]
  /** Preços encontrados, na ordem em que aparecem. */
  prices: OfferPrice[]
  /** Primeiro link do corpo da mensagem (normalmente o link da loja). */
  link: string | null
  /** Linhas que não viraram título/preço/cupom/link — exibidas como corpo. */
  body: string
}

const URL_RE = /https?:\/\/[^\s]+/g

/** Palavras que abrem o rótulo de cupom, em pt e en. */
const COUPON_LABEL = "(?:cupom|cupon|coupon|c[óo]digo|code)"

/**
 * "Cupom: X" / "Código - X" — com separador explícito, aceita qualquer código.
 */
const COUPON_RE = new RegExp(
  `${COUPON_LABEL}\\s*(?:de\\s+desconto\\s*)?[:\\-–]\\s*([^\\s,;]{3,32})`,
  "gi"
)

/**
 * "Cupom VIP" — sem separador. Aqui o código precisa ter dígito **ou** estar em
 * caixa alta junto de um rótulo isolado; senão o nome da loja no título
 * ("Cupom Shopee", "Cupom OLX") seria lido como se fosse o código.
 */
const COUPON_NO_SEP_RE = new RegExp(
  `${COUPON_LABEL}\\s+([A-Z0-9][A-Z0-9_-]*\\d[A-Z0-9_-]*)(?=\\s|$)`,
  "g"
)

/**
 * Exceção ao "precisa ter dígito": uma linha que é *só* o rótulo mais o código
 * ("🏷 Cupom VIP") não tem como ser o nome da loja no meio de uma frase.
 *
 * O rótulo é case-insensitive, mas o código **não** — precisa vir em caixa alta
 * no original. Sem isso "Cupom Shopee" (título da promoção) viraria o código
 * "SHOPEE".
 */
const COUPON_ONLY_LINE_RE = new RegExp(
  `^\\s*${COUPON_LABEL}\\s*[:\\-–]?\\s*(\\S{3,32})\\s*$`,
  "i"
)

/**
 * "R$ 15 OFF em R$ 79: 994M4NH4" — o código vem depois de um rótulo de
 * desconto que termina em `:`, na mesma linha.
 */
const COUPON_AFTER_DISCOUNT_RE = /off\s+em\s+[^\n:]*:\s*([A-Z0-9][A-Z0-9_-]{2,31})(?=\s|$)/i

/**
 * Linha que é *só* o código, marcada por emoji de sacola/etiqueta/carrinho:
 *
 *   🛍️ TECH15
 *   🏷 FESTAMELI
 *
 * É o formato mais comum no canal hoje — não existe a palavra "cupom" em
 * lugar nenhum, o emoji é que dá o sentido. Sem essa regra a maioria das
 * ofertas perde o cupom.
 */
const BARE_COUPON_LINE_RE = /^[\s]*[\u{1F6CD}\u{1F3F7}\u{1F6D2}\u{1F4B3}\u{1F39F}]\uFE0F?\s*([A-Z0-9][A-Z0-9_-]{2,31})\s*$/u

/**
 * Rótulo que termina em `:` e deixa o código na linha seguinte:
 *
 *   R$ 50 OFF em R$ 500:
 *   FESTA50
 */
const COUPON_LABEL_LINE_RE = /(?:cupom|cupon|coupon|c[óo]digo|code|off\s+em|desconto)\b[^\n]*:\s*$/i

/** Código sozinho numa linha, em caixa alta — só vale logo após um rótulo. */
const STANDALONE_CODE_RE = /^\s*([A-Z0-9][A-Z0-9_-]{2,31})\s*$/

/** Linha de preço: "R$ 1.234,56", "R$ 609", "RS 609", "609 reais". */
const PRICE_RE = /(?:R\$|RS|\bBRL\b)\s*([\d.]+(?:,\d{1,2})?)/i

/** "12x", "em 10 x", "10 vezes". */
const INSTALLMENTS_RE = /(\d{1,2})\s*(?:x\b|vezes\b)/i

const PIX_RE = /(?:\bpix\b|[àa]\s*vista|\bboleto\b|\bdinheiro\b)/i

/** Emoji e pontuação decorativa que abrem quase toda linha do canal. */
const LEADING_DECORATION_RE =
  /^[\s\p{Extended_Pictographic}\p{Emoji_Presentation}️‍ -⁯←-⯿*_~`•·\-–—>]+/u

const TRAILING_DECORATION_RE = /[\s*_~`]+$/u

/** Remove emoji/markdown das pontas de uma linha, preservando o miolo. */
function stripDecoration(line: string) {
  return line.replace(LEADING_DECORATION_RE, "").replace(TRAILING_DECORATION_RE, "").trim()
}

/** Converte "1.234,56" (pt-BR) ou "1234.56" para número. */
function parseBrlNumber(raw: string): number | null {
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : // Sem centavos: os pontos são separadores de milhar ("1.234" → 1234).
      raw.replace(/\./g, "")
  const value = Number.parseFloat(normalized)
  return Number.isFinite(value) ? value : null
}

/** Tira crases/asteriscos/aspas que às vezes envolvem o código do cupom. */
function cleanCouponCode(raw: string) {
  return raw
    .replace(/^[`*_"'"'([{<]+/, "")
    .replace(/[`*_"'"')\]}>.,;:!?]+$/, "")
    .trim()
    .toUpperCase()
}

/**
 * Precisa parecer um código, não uma palavra solta: só A-Z/0-9/-/_ e, além
 * disso, ou tem dígito ou tem pelo menos 5 letras. Sem isso o separador por
 * espaço ("cupom no carrinho") viraria o cupom "NO".
 *
 * Palavras comuns que sobrevivem a essa peneira ficam na blocklist — são as
 * que aparecem logo depois de "cupom"/"código" numa frase normal.
 */
const COUPON_STOPWORDS = new Set([
  "APLICADO",
  "DESCONTO",
  "DISPONIVEL",
  "EXCLUSIVO",
  "PRIMEIRA",
  "PROMOCIONAL",
  "AUTOMATICO",
  "CARRINHO",
  "COMPRA",
])

function looksLikeCouponCode(code: string) {
  if (code.length < 3 || code.length > 32) return false
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) return false
  if (COUPON_STOPWORDS.has(code)) return false
  return true
}

type CouponScan = {
  coupons: string[]
  /** Índices de linha que só existiam para anunciar o cupom. */
  consumedLines: Set<number>
}

/**
 * Varre a mensagem linha a linha atrás dos três formatos que o canal usa.
 *
 * Devolve também quais linhas foram inteiramente consumidas, para o corpo do
 * card não repetir o que já virou badge de cupom.
 */
function extractCoupons(lines: string[]): CouponScan {
  const coupons: string[] = []
  const consumedLines = new Set<number>()

  const add = (raw: string) => {
    const code = cleanCouponCode(raw)
    if (!looksLikeCouponCode(code)) return false
    if (!coupons.includes(code)) coupons.push(code)
    return true
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (!line) return

    // Um link nunca é código de cupom ("Resgate os cupons: s.shopee.com.br/x").
    if (URL_RE.test(line)) {
      URL_RE.lastIndex = 0
      return
    }
    URL_RE.lastIndex = 0

    // 1) "🛍️ TECH15" — emoji + código, nada mais na linha.
    const bare = line.match(BARE_COUPON_LINE_RE)
    if (bare && add(bare[1])) {
      consumedLines.add(index)
      return
    }

    // 2) Linha que é só "Cupom VIP" / "Cupom: VIP" — código curto pode, mas
    // precisa já estar em caixa alta ("Cupom Shopee" é nome de loja, não código).
    const onlyLine = stripDecoration(line).match(COUPON_ONLY_LINE_RE)
    const onlyCode = onlyLine?.[1] ?? ""
    if (onlyCode && onlyCode === onlyCode.toUpperCase() && add(onlyCode)) {
      consumedLines.add(index)
      return
    }

    // 3) "R$ 15 OFF em R$ 79: 994M4NH4" na mesma linha.
    const afterDiscount = line.match(COUPON_AFTER_DISCOUNT_RE)
    if (afterDiscount) add(afterDiscount[1])

    // 4) "Cupom: X" com separador, e "Cupom X1" sem separador (exige dígito).
    let matchedLabel = false
    for (const re of [COUPON_RE, COUPON_NO_SEP_RE]) {
      re.lastIndex = 0
      for (const match of line.matchAll(re)) {
        if (add(match[1] ?? "")) matchedLabel = true
      }
      re.lastIndex = 0
    }
    if (matchedLabel) {
      // Só some do corpo se a linha não disser mais nada além do cupom.
      const leftover = stripDecoration(
        line.replace(COUPON_RE, "").replace(COUPON_NO_SEP_RE, "")
      )
      COUPON_RE.lastIndex = 0
      COUPON_NO_SEP_RE.lastIndex = 0
      if (!leftover) consumedLines.add(index)
      return
    }

    // 5) Rótulo terminando em ":" e o código na linha de baixo.
    if (COUPON_LABEL_LINE_RE.test(line)) {
      const nextIndex = index + 1
      const next = lines[nextIndex]?.trim() ?? ""
      const standalone = next.match(STANDALONE_CODE_RE)
      if (standalone && add(standalone[1])) consumedLines.add(nextIndex)
    }
  })

  return { coupons, consumedLines }
}

function parsePriceLine(line: string): OfferPrice | null {
  const match = line.match(PRICE_RE)
  if (!match) return null

  const label = `R$ ${match[1]}`
  const rest = stripDecoration(line.slice(0, match.index ?? 0) + line.slice((match.index ?? 0) + match[0].length))
  const installmentsMatch = line.match(INSTALLMENTS_RE)

  return {
    label,
    value: parseBrlNumber(match[1]),
    note: rest || null,
    isPix: PIX_RE.test(line),
    installments: installmentsMatch ? Number.parseInt(installmentsMatch[1], 10) : null,
  }
}

/**
 * Quebra a mensagem crua nos campos que a UI sabe destacar.
 *
 * Uma linha é consumida (isto é, sai do `body`) só quando vira preço, cupom ou
 * link *sozinha*. Linha mista — "R$ 609 no Pix com o cupom X" — continua no
 * corpo, para não perder contexto.
 */
export function parseOffer(text: string): ParsedOffer {
  const lines = text.split("\n")
  const { coupons, consumedLines } = extractCoupons(lines)

  let title: string | null = null
  let link: string | null = null
  const prices: OfferPrice[] = []
  const bodyLines: string[] = []

  for (const [index, rawLine] of lines.entries()) {
    if (consumedLines.has(index)) continue
    const line = rawLine.trim()
    if (!line) {
      // Preserva parágrafos do corpo, mas não deixa o corpo começar em branco.
      if (bodyLines.length > 0) bodyLines.push("")
      continue
    }

    const urls = line.match(URL_RE)
    if (urls) {
      link ??= urls[0]
      // Linha que é só o link não precisa aparecer duas vezes.
      if (stripDecoration(line.replace(URL_RE, "")).length === 0) continue
    }

    const price = parsePriceLine(line)
    if (price) {
      prices.push(price)
      continue
    }

    const withoutDecoration = stripDecoration(line)
    if (!withoutDecoration) continue

    if (title === null) {
      title = withoutDecoration
      continue
    }

    bodyLines.push(withoutDecoration)
  }

  return {
    title,
    coupons,
    prices,
    link,
    body: bodyLines.join("\n").trim(),
  }
}

/** Menor preço da oferta — usado para ordenar e para o selo de destaque. */
export function getLowestPrice(prices: OfferPrice[]): OfferPrice | null {
  const withValue = prices.filter((p) => p.value !== null)
  if (withValue.length === 0) return prices[0] ?? null
  return withValue.reduce((min, p) => ((p.value as number) < (min.value as number) ? p : min))
}
