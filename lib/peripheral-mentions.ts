/**
 * Detecção de periféricos citados em texto livre (post do fórum).
 *
 * Isomórfico de propósito — SEM `server-only`. O mesmo índice roda:
 *  - no cliente, enquanto o usuário digita o post ("live mode");
 *  - no servidor, ao publicar (o cliente nunca é fonte de verdade);
 *  - no script de backfill do acervo antigo.
 *
 * ## Por que casamento por frase e não busca no banco
 *
 * O catálogo tem 576 periféricos / 180 marcas. O índice completo de frases
 * ocupa ~19 KB gzipado e uma detecção custa ~0,17 ms, então a digitação é
 * resolvida inteiramente no cliente: zero query por tecla, zero tabela de
 * sugestão. Um `ilike` por tecla no Postgres custaria muito mais e não
 * resolveria a ambiguidade abaixo.
 *
 * ## As três armadilhas do catálogo (medidas, não hipotéticas)
 *
 * 1. **Linhas duplicadas.** `Razer DeathAdder V3 Pro`, `ATK Duckbill` e
 *    `TTC Elf King ` (com espaço final) existem 2× cada, e há pares onde só um
 *    lado traz a marca no nome (`DeathAdder V4 Pro` vs `Razer DeathAdder V4
 *    Pro`). Comparar pelo nome cru faria o par parecer ambíguo e o vínculo
 *    legítimo seria descartado. Por isso a identidade é a CHAVE CANÔNICA
 *    `marca|modelo|categoria` — duplicata colapsa, periférico distinto não.
 *
 * 2. **Modelos genuinamente ambíguos.** `rs6 ultra` é teclado da ATK *e* mouse
 *    da Attack Shark; `thorn v2` é mousepad Aimstar *e* mouse Lamzu. Nesses
 *    casos o texto sozinho não decide, então NÃO se vincula nada — um link
 *    errado numa página indexável é pior que link nenhum.
 *
 * 3. **Modelos aninhados.** 41 modelos são substring de outro (`deathadder` ⊂
 *    `deathadder v4 pro`). A varredura vai da frase mais longa para a mais
 *    curta e marca a faixa consumida, então "DeathAdder V4 Pro" nunca é
 *    reduzido ao "DeathAdder" genérico.
 *
 * Um modelo de UM token só casa se a marca aparecer no texto, e nunca se for
 * palavra comum (STOPWORDS). Sem essa regra "o zero é liso" viraria `ATK Zero`
 * e "pega um redragon cobra" viraria `Razer Cobra`.
 */

/** Confiança do casamento. Só `strong` é vinculado automaticamente. */
export type MentionConfidence = "strong" | "suggested"

export type DetectedMention = {
  peripheralId: string
  /** Frase normalizada que casou — usada no relatório do backfill. */
  phrase: string
  confidence: MentionConfidence
}

/** Entrada mínima para montar o índice — compatível com `PeripheralRecord`/`PeripheralSummary`. */
export type MentionCandidate = {
  id: string
  name: string
  brand: string
  category: string
}

/**
 * Palavras que, sozinhas, não identificam um periférico. Sem isso, modelos de
 * um token só (`Zero`, `Cobra`, `Atlas`, `Ghost`) casariam com texto comum em
 * português. Não inclui token alfanumérico tipo `v3`/`60he`, que é distintivo.
 */
const STOPWORDS = new Set([
  "pro", "max", "mini", "plus", "se", "air", "lite", "ultra", "one", "two",
  "zero", "atlas", "cobra", "ghost", "thorn", "sosu", "duckbill",
  "preto", "branco", "black", "white", "edition", "the", "by",
  "speed", "control", "glass", "pad", "mouse", "teclado", "keyboard",
  "headset", "gaming", "game", "rgb", "usb", "he", "light", "soft", "hard",
])

/** Tamanho mínimo de um modelo de token único para ser considerado. */
const MIN_SINGLE_TOKEN_LENGTH = 4

/** Teto de vínculos por post — evita que um post "meu setup" vire lista de 30 links. */
export const MAX_PERIPHERAL_MENTIONS = 8

/**
 * Normalização compartilhada: minúscula, sem acento, sem pontuação, espaço
 * único. Mesma base do `slugify` de `lib/peripheral-slug.ts`, mas preservando
 * o espaço como separador de token (o slug usa `-`).
 */
export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(value: string): string[] {
  const normalized = normalizeForMatch(value)
  return normalized ? normalized.split(" ") : []
}

/**
 * Modelo = nome sem o prefixo da marca. "Razer DeathAdder V3" -> "deathadder
 * v3". Quando o nome não começa pela marca (161 dos 576 casos, tipo "APEX
 * Control Preto" da Titorion), o nome inteiro é o modelo.
 */
function modelTokens(candidate: MentionCandidate): string[] {
  const nameTokens = tokenize(candidate.name)
  const brandTokens = tokenize(candidate.brand)
  if (brandTokens.length === 0) return nameTokens
  const startsWithBrand = brandTokens.every((token, i) => nameTokens[i] === token)
  return startsWithBrand ? nameTokens.slice(brandTokens.length) : nameTokens
}

/**
 * Identidade real do periférico. Duas linhas com a mesma chave são a MESMA
 * coisa cadastrada duas vezes — colapsam em vez de virar ambiguidade.
 */
function canonicalKey(candidate: MentionCandidate): string {
  return `${normalizeForMatch(candidate.brand)}|${modelTokens(candidate).join(" ")}|${candidate.category}`
}

type IndexEntry = {
  peripheralId: string
  /** Exige a marca presente no texto (modelo de token único). */
  requiresBrand: boolean
  brandPhrase: string
  /** `true` quando mais de um periférico distinto reivindica a frase. */
  ambiguous: boolean
}

export type MentionIndex = {
  /** Frase normalizada -> entrada. Frases ambíguas ficam marcadas, não removidas. */
  entries: Record<string, IndexEntry>
  /** Frases ordenadas da mais longa para a mais curta (longest-match-wins). */
  phrases: string[]
}

/**
 * Monta o índice de frases a partir do catálogo. Feito uma vez por request
 * (servidor) ou uma vez por sessão (cliente) — nunca por tecla digitada.
 */
export function buildMentionIndex(candidates: MentionCandidate[]): MentionIndex {
  // frase -> chave canônica -> candidato. O segundo nível é o que distingue
  // "duplicata do catálogo" de "dois periféricos diferentes".
  const byPhrase = new Map<string, Map<string, { candidate: MentionCandidate; requiresBrand: boolean }>>()

  const register = (phrase: string, candidate: MentionCandidate, requiresBrand: boolean) => {
    if (!phrase) return
    let claimants = byPhrase.get(phrase)
    if (!claimants) {
      claimants = new Map()
      byPhrase.set(phrase, claimants)
    }
    // O primeiro a reivindicar vence dentro da mesma chave canônica: manter a
    // exigência de marca mais frouxa evita que a duplicata endureça o match.
    const key = canonicalKey(candidate)
    const existing = claimants.get(key)
    if (!existing || (existing.requiresBrand && !requiresBrand)) {
      claimants.set(key, { candidate, requiresBrand })
    }
  }

  for (const candidate of candidates) {
    const nameTokens = tokenize(candidate.name)
    const brandTokens = tokenize(candidate.brand)
    const model = modelTokens(candidate)

    // Nome completo como cadastrado ("razer deathadder v3 pro").
    if (nameTokens.length >= 2) register(nameTokens.join(" "), candidate, false)

    // Modelo sem a marca — como a maioria das pessoas escreve ("ae64 pro").
    if (model.length >= 2) register(model.join(" "), candidate, false)

    // Modelo de um token só: distintivo o bastante? Então só com a marca junto.
    if (
      model.length === 1 &&
      model[0].length >= MIN_SINGLE_TOKEN_LENGTH &&
      !STOPWORDS.has(model[0])
    ) {
      register(model[0], candidate, true)
    }

    // Nome que não começa pela marca ganha também a forma "marca + nome",
    // porque é assim que o usuário cita ("titorion apex control preto").
    const startsWithBrand = brandTokens.length > 0 && brandTokens.every((t, i) => nameTokens[i] === t)
    if (nameTokens.length >= 1 && brandTokens.length > 0 && !startsWithBrand) {
      register([...brandTokens, ...nameTokens].join(" "), candidate, false)
    }
  }

  const entries: Record<string, IndexEntry> = {}
  for (const [phrase, claimants] of byPhrase) {
    const distinct = [...claimants.values()]
    const first = distinct[0]
    entries[phrase] = {
      peripheralId: first.candidate.id,
      requiresBrand: first.requiresBrand,
      brandPhrase: normalizeForMatch(first.candidate.brand),
      ambiguous: distinct.length > 1,
    }
  }

  const phrases = Object.keys(entries).sort((a, b) => {
    const byTokens = b.split(" ").length - a.split(" ").length
    return byTokens !== 0 ? byTokens : b.length - a.length
  })

  return { entries, phrases }
}

/**
 * Detecta periféricos citados no texto.
 *
 * Varre da frase mais longa para a mais curta e marca as faixas já consumidas,
 * para que o match mais específico vença. Frase ambígua consome a faixa (para
 * não ser reinterpretada por uma frase menor) mas NÃO produz vínculo.
 */
export function detectPeripherals(text: string, index: MentionIndex): DetectedMention[] {
  if (!text.trim()) return []

  // Espaço nas bordas para que ` frase ` case também no início e no fim.
  const haystack = ` ${normalizeForMatch(text)} `
  const found = new Map<string, DetectedMention>()
  const consumed: Array<[number, number]> = []

  const isConsumed = (start: number, end: number) =>
    consumed.some(([from, to]) => start >= from - 1 && end <= to + 1)

  for (const phrase of index.phrases) {
    const entry = index.entries[phrase]
    const needle = ` ${phrase} `
    let searchFrom = 0
    let at = haystack.indexOf(needle, searchFrom)

    while (at !== -1) {
      const start = at
      const end = at + needle.length

      if (!isConsumed(start, end)) {
        // Modelo de um token exige a marca em algum lugar do texto.
        const brandSatisfied =
          !entry.requiresBrand || haystack.includes(` ${entry.brandPhrase} `)

        if (entry.ambiguous) {
          // Consome a faixa sem vincular: o texto cita algo, mas não dá para
          // saber o quê. Deixar livre faria uma frase menor casar errado.
          consumed.push([start, end])
        } else if (brandSatisfied) {
          consumed.push([start, end])
          if (!found.has(entry.peripheralId)) {
            found.set(entry.peripheralId, {
              peripheralId: entry.peripheralId,
              phrase,
              confidence: "strong",
            })
          }
        }
      }

      searchFrom = at + 1
      at = haystack.indexOf(needle, searchFrom)
    }
  }

  return [...found.values()].slice(0, MAX_PERIPHERAL_MENTIONS)
}

/**
 * Formato enxuto trafegado até o cliente: só frase -> id, já sem as ambíguas
 * (que nunca vinculam) e sem os campos de marca, reconstruídos na hidratação.
 */
export type SerializedMentionIndex = {
  /** `[frase, peripheralId, requiresBrand ? marca : ""]` */
  p: Array<[string, string, string]>
}

export function serializeMentionIndex(index: MentionIndex): SerializedMentionIndex {
  const p: Array<[string, string, string]> = []
  for (const phrase of index.phrases) {
    const entry = index.entries[phrase]
    if (entry.ambiguous) continue
    p.push([phrase, entry.peripheralId, entry.requiresBrand ? entry.brandPhrase : ""])
  }
  return { p }
}

export function deserializeMentionIndex(payload: SerializedMentionIndex): MentionIndex {
  const entries: Record<string, IndexEntry> = {}
  const phrases: string[] = []
  for (const [phrase, peripheralId, brandPhrase] of payload.p) {
    entries[phrase] = {
      peripheralId,
      requiresBrand: brandPhrase !== "",
      brandPhrase,
      ambiguous: false,
    }
    phrases.push(phrase)
  }
  // A serialização já preserva a ordem longest-first de `buildMentionIndex`.
  return { entries, phrases }
}
