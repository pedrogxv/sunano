import { CATEGORY_TAGS_OVERRIDE, GENERIC_TAGS_OPTIONS, type TagOption } from "@/lib/tag-options"

/**
 * Montagem do termo da busca da Loja (módulo puro, sem servidor).
 *
 * Quem procura é a função SQL `store_search_products` (migration
 * 20261204000001), que olha nome, marca, categoria, sensor e as palavras-chave
 * do Database ao mesmo tempo. Este módulo só decide O QUE procurar: quebra o
 * texto digitado em grupos (uma palavra = um grupo) e junta a cada grupo os
 * sinônimos que o banco sozinho não saberia: a categoria gravada é
 * "keyboard", mas o cliente digita "teclado"; a tag gravada é "light", mas a
 * tela mostra "Leve".
 *
 * O produto precisa bater em TODOS os grupos; dentro de um grupo, basta uma
 * das alternativas.
 */

/** Mesmo mapa do `translate()` de `store_search_normalize`: os dois lados precisam gerar o mesmo texto. */
const ACCENT_FROM = "áàâãäåāéèêëēíìîïīóòôõöøōúùûüūçñýÁÀÂÃÄÅĀÉÈÊËĒÍÌÎÏĪÓÒÔÕÖØŌÚÙÛÜŪÇÑÝ"
const ACCENT_TO = "aaaaaaaeeeeeiiiiiooooooouuuuucnyaaaaaaaeeeeeiiiiiooooooouuuuucny"
const ACCENT_MAP = new Map([...ACCENT_FROM].map((char, index) => [char, ACCENT_TO[index]]))

/** Minúsculas, sem acento, e tudo que não é letra/dígito vira um espaço só. */
export function normalizeStoreSearchText(value: string | null | undefined): string {
  let out = ""
  for (const char of value ?? "") out += ACCENT_MAP.get(char) ?? char
  return out.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

/** Palavras mais curtas que isso não viram grupo sozinhas ("x", "g"): casariam com quase tudo. */
const MIN_TOKEN_LENGTH = 2
/** Prefixo mínimo para completar uma palavra ("tecl" → teclado). Abaixo disso, só palavra exata. */
const MIN_PREFIX_LENGTH = 4
/** Teto de grupos: uma frase enorme não vira uma consulta enorme. */
const MAX_GROUPS = 6

/**
 * Categoria da Loja é texto livre em inglês (ver CATEGORIES em
 * app/admin/store/form.tsx). Cada chave lista como o cliente a chamaria.
 */
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  mouse: ["mouse", "mouses", "mice"],
  keyboard: ["teclado", "teclados", "keyboard", "keyboards"],
  mousepad: ["mousepad", "mousepads", "mouse pad", "pad"],
  glasspad: ["glasspad", "glass pad", "pad de vidro", "mousepad de vidro", "mousepad vidro", "vidro"],
  headset: ["headset", "headsets", "headphone", "fone", "fones"],
  iem: ["iem", "iems", "in ear", "fone", "fones", "earphone"],
  switches: ["switch", "switches"],
  dac_amp: ["dac", "amp", "amplificador"],
  feet: ["feet", "skate", "skates", "pezinho", "pezinhos"],
  acessorio: ["acessorio", "acessorios"],
  services: ["servico", "servicos", "service", "services"],
}

type Synonym = { phrase: string; alternatives: string[] }

let cachedSynonyms: Synonym[] | null = null

/**
 * Todos os sinônimos conhecidos, com a frase já normalizada. Frases de mais de
 * uma palavra ("sem fio", "custo beneficio") vêm primeiro para serem casadas
 * antes de a frase ser quebrada em palavras soltas.
 */
function getSynonyms(): Synonym[] {
  if (cachedSynonyms) return cachedSynonyms

  const byPhrase = new Map<string, Set<string>>()
  // Registra mesmo quando frase e alternativa são iguais ("mouse" → "mouse"):
  // é o que faz `expandWord` reconhecer a palavra como completa e não sair
  // completando pelo começo.
  const add = (phrase: string, alternative: string) => {
    const key = normalizeStoreSearchText(phrase)
    const value = normalizeStoreSearchText(alternative)
    if (!key || !value) return
    const set = byPhrase.get(key) ?? new Set<string>()
    set.add(value)
    byPhrase.set(key, set)
  }

  for (const [category, words] of Object.entries(CATEGORY_SYNONYMS)) {
    for (const word of words) add(word, category)
  }

  const tagPools: TagOption[] = [...GENERIC_TAGS_OPTIONS, ...Object.values(CATEGORY_TAGS_OVERRIDE).flat()]
  for (const tag of tagPools) {
    add(tag.pt, tag.key)
    add(tag.en, tag.key)
  }

  cachedSynonyms = [...byPhrase.entries()]
    .map(([phrase, alternatives]) => ({ phrase, alternatives: [...alternatives] }))
    .sort((a, b) => b.phrase.split(" ").length - a.phrase.split(" ").length)
  return cachedSynonyms
}

/**
 * Sinônimos de UMA palavra. Palavra que já é um sinônimo completo usa só ele;
 * completar pelo começo ("tecl" → teclado) fica para quando não é, senão
 * "mouse", que começa "mousepad", puxaria a categoria mousepad junto e os
 * mousepads disputariam o topo com os mouses.
 */
function expandWord(word: string): string[] {
  const alternatives = new Set<string>([word])

  // Plural simples: "mouses" também procura "mouse", "teclados" também "teclado".
  if (word.length > MIN_PREFIX_LENGTH && word.endsWith("s") && !/\d/.test(word)) {
    alternatives.add(word.slice(0, -1))
  }

  const singleWord = getSynonyms().filter((synonym) => !synonym.phrase.includes(" "))
  const exact = singleWord.filter((synonym) => synonym.phrase === word)
  const matched =
    exact.length > 0 || word.length < MIN_PREFIX_LENGTH
      ? exact
      : singleWord.filter((synonym) => synonym.phrase.startsWith(word))

  for (const synonym of matched) {
    for (const alternative of synonym.alternatives) alternatives.add(alternative)
  }

  return [...alternatives]
}

export type StoreSearchPlan = {
  /** Um grupo por palavra digitada; cada grupo é a palavra + sinônimos. */
  groups: string[][]
  /** Texto inteiro normalizado, para o bônus de "a frase aparece no nome". */
  phrase: string
}

export function buildStoreSearchPlan(query: string): StoreSearchPlan {
  const phrase = normalizeStoreSearchText(query)
  if (!phrase) return { groups: [], phrase }

  const groups: string[][] = []
  // Espaços nas pontas para casar frase inteira ("sem fio"), nunca pedaço de
  // palavra ("xsem fiox").
  let rest = ` ${phrase} `

  for (const synonym of getSynonyms()) {
    if (!synonym.phrase.includes(" ")) continue
    const needle = ` ${synonym.phrase} `
    if (!rest.includes(needle)) continue
    groups.push([synonym.phrase, ...synonym.alternatives])
    rest = rest.replace(needle, " ")
  }

  const seen = new Set<string>()
  for (const word of rest.split(" ")) {
    if (word.length < MIN_TOKEN_LENGTH || seen.has(word)) continue
    seen.add(word)
    groups.push(expandWord(word))
  }

  return { groups: groups.slice(0, MAX_GROUPS), phrase }
}
