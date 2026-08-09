/**
 * Filtro de termos ofensivos (nome de exibição e bio do perfil).
 *
 * Usa a engine de matching da lib `obscenity` (MIT, sem dependências) com um
 * dicionário próprio em português — a lib não inclui palavras em PT-BR, só o
 * motor de detecção (leetspeak, caracteres repetidos, confusáveis Unicode).
 *
 * Módulo puro: roda tanto no servidor (validação real) quanto no client (feedback
 * imediato no formulário). A validação que decide se algo é salvo é sempre a do
 * servidor — o client é só UX.
 */

import {
  RegExpMatcher,
  TextCensor,
  asteriskCensorStrategy,
  collapseDuplicatesTransformer,
  pattern,
  remapCharactersTransformer,
  resolveConfusablesTransformer,
  resolveLeetSpeakTransformer,
  toAsciiLowerCaseTransformer,
} from "obscenity"

/**
 * Termos bloqueados: baixo calão, xingamentos e termos de ódio/discriminação
 * comuns em português. Cada entrada é a raiz do termo — a lib já cobre
 * variações de maiúsculas, leetspeak (`p0rr4`), caracteres repetidos
 * (`porraaaa`) e espaçamento/pontuação entre letras.
 *
 * Curadoria deliberadamente conservadora: evita raízes curtas demais que
 * capturariam palavras legítimas como falso positivo (ex.: não bloqueamos
 * "cu" isolado, que apareceria dentro de "Cuba", "curioso" etc. — os termos
 * abaixo já são a palavra ofensiva completa).
 */
const BLOCKED_TERMS = [
  // Baixo calão
  "porra",
  "caralho",
  "krlho",
  "merda",
  "bosta",
  "cacete",
  "puta",
  "putaria",
  "foda",
  "fodase",
  "fdp",
  "arrombado",
  "arrombada",
  "cuzao",
  "cuzão",
  "cuzinho",
  "desgraca",
  "desgraça",
  "babaca",
  "otario",
  "otário",
  "idiota",
  "imbecil",
  "retardado",
  "retardada",
  "escroto",
  "escrota",
  "cacetada",
  "piranha",
  "vagabundo",
  "vagabunda",
  "corno",
  "corna",
  "boceta",
  "buceta",
  "xoxota",
  "pinto",
  "piroca",
  "pau no cu",
  "rola",
  "pinto duro",
  "safado",
  "safada",
  "cadela",
  "vadia",
  "vagal",
  // Discurso de ódio / discriminação
  "viado",
  "veado",
  "bicha",
  "sapatao",
  "sapatão",
  "traveco",
  "macaco",
  "macaca",
  "crioulo",
  "crioula",
  "neguinho",
  "neguinha",
  "nazista",
  "hitler",
  "pedofilo",
  "pedófilo",
  "estuprador",
  "terrorista",
] as const

/**
 * Raízes bloqueadas: como `BLOCKED_TERMS`, mas sem fronteira de palavra no
 * final — cobrem toda uma família de flexões (substantivo, verbo, agente) com
 * uma entrada só. Usadas só para raízes longas o bastante para não colidir
 * com palavras legítimas (nenhuma palavra comum em português começa com
 * "estupr"/"estrup").
 */
const BLOCKED_ROOTS = [
  // Cobre "estupro", "estupra(r)", "estuprador(a)" e a grafia "estrupa"
  // (erro/gíria comum para a mesma palavra).
  "estupr",
  "estrup",
] as const

let matcherInstance: RegExpMatcher | null = null

function getMatcher(): RegExpMatcher {
  if (matcherInstance) return matcherInstance

  matcherInstance = new RegExpMatcher({
    blacklistedTerms: [
      ...BLOCKED_TERMS.map((term, index) => ({
        id: index,
        // `|term|` fixa fronteira de palavra nas duas pontas — barra "porra"
        // mas não invalida substrings dentro de uma palavra maior legítima.
        pattern: pattern`|${term}|`,
      })),
      ...BLOCKED_ROOTS.map((term, index) => ({
        id: BLOCKED_TERMS.length + index,
        // Sem fronteira de palavra nenhuma: precisa bater em qualquer posição,
        // inclusive colado a outras palavras (comum em nicknames tipo
        // "ShaolimEstrupaPorco"). Seguro só porque a raiz é longa/específica
        // o bastante para não aparecer dentro de palavras legítimas.
        pattern: pattern`${term}`,
      })),
    ],
    blacklistMatcherTransformers: [
      resolveConfusablesTransformer(),
      resolveLeetSpeakTransformer(),
      // Acentuação comum em português — a lib não trata isso nativamente.
      remapCharactersTransformer({
        a: "áàâãä",
        e: "éèêë",
        i: "íìîï",
        o: "óòôõö",
        u: "úùûü",
        c: "ç",
      }),
      toAsciiLowerCaseTransformer(),
      // Colapsa repetição usada pra burlar o filtro (ex.: "porraaaa" -> 1 "a").
      // "r" precisa de um limiar maior: vários termos da lista têm "rr" dobrado
      // (porra, arrombado, terrorista) e o default (1) quebraria o próprio
      // padrão, fazendo-o parar de bater até na forma exata da palavra.
      collapseDuplicatesTransformer({
        defaultThreshold: 1,
        customThresholds: new Map([["r", 2]]),
      }),
    ],
  })

  return matcherInstance
}

const censor = new TextCensor().setStrategy(asteriskCensorStrategy())

export type ContentFilterResult = {
  /** `true` quando o texto contém algum termo bloqueado. */
  blocked: boolean
  /** Texto com os termos ofensivos substituídos por asteriscos. Igual ao original quando `blocked` é `false`. */
  censored: string
}

/** Verifica um texto contra o dicionário de termos bloqueados. */
export function checkContent(text: string): ContentFilterResult {
  if (!text) return { blocked: false, censored: text }

  const matches = getMatcher().getAllMatches(text)
  if (matches.length === 0) return { blocked: false, censored: text }

  return { blocked: true, censored: censor.applyTo(text, matches) }
}

/** Mensagem padrão exibida quando um nome/bio é bloqueado pelo filtro. */
export const CONTENT_FILTER_MESSAGE =
  "Esse texto contém um termo não permitido pelos nossos Termos de Uso. Escolha outra palavra."
