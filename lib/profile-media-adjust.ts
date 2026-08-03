/**
 * Enquadramento das imagens do perfil (foto, banner e fundo do Mini Perfil).
 *
 * O ajuste é **não-destrutivo**: guardamos onde a pessoa posicionou a imagem e
 * quanto aproximou, e o enquadramento é aplicado no CSS (`object-position` +
 * `scale`) na hora de exibir. O arquivo enviado nunca é recortado.
 *
 * O motivo é o GIF de membro VIP: recortar de verdade exigiria redesenhar a
 * imagem num canvas, e um canvas devolve um único quadro — o GIF chegaria
 * parado ao bucket. Guardando só as coordenadas, a mesma regra de
 * enquadramento vale para JPG e para GIF animado, e ela continua reversível:
 * mudar de ideia é arrastar de novo, não subir o arquivo outra vez.
 *
 * Módulo puro (sem I/O): serve o editor no client e a renderização no servidor,
 * então os dois concordam sobre o que é um enquadramento válido.
 */

/** As três imagens que o usuário enquadra. */
export const ADJUSTABLE_MEDIA = ["avatar", "banner", "mini_banner"] as const

export type AdjustableMedia = (typeof ADJUSTABLE_MEDIA)[number]

/**
 * Um enquadramento. `x`/`y` são a posição do foco em porcentagem (0–100, o que
 * `object-position` já entende); `zoom` é o fator de aproximação.
 */
export type MediaAdjust = {
  x: number
  y: number
  zoom: number
}

/** Centralizado e sem aproximação — o que `object-cover` faz sozinho. */
export const DEFAULT_ADJUST: MediaAdjust = { x: 50, y: 50, zoom: 1 }

export const MIN_ZOOM = 1
/** Acima de 3× a imagem vira um borrão em qualquer resolução razoável. */
export const MAX_ZOOM = 3

export type ProfileMediaAdjustments = Record<AdjustableMedia, MediaAdjust>

export const DEFAULT_ADJUSTMENTS: ProfileMediaAdjustments = {
  avatar: DEFAULT_ADJUST,
  banner: DEFAULT_ADJUST,
  mini_banner: DEFAULT_ADJUST,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Arredonda para uma casa: o JSON não precisa guardar 12 dígitos de arrasto. */
function round(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Normaliza um enquadramento vindo do banco ou de um payload do cliente.
 *
 * Nada aqui confia na entrada: valor fora da faixa, `NaN` ou campo ausente
 * volta ao centro. Um enquadramento inválido não pode quebrar a exibição de um
 * perfil — no pior caso a imagem aparece como apareceria sem ajuste nenhum.
 */
export function coerceMediaAdjust(value: unknown): MediaAdjust {
  if (!value || typeof value !== "object") return DEFAULT_ADJUST

  const raw = value as Record<string, unknown>
  const num = (input: unknown, fallback: number) =>
    typeof input === "number" && Number.isFinite(input) ? input : fallback

  return {
    x: round(clamp(num(raw.x, 50), 0, 100)),
    y: round(clamp(num(raw.y, 50), 0, 100)),
    zoom: round(clamp(num(raw.zoom, 1), MIN_ZOOM, MAX_ZOOM)),
  }
}

/** Normaliza o conjunto das três imagens. Chaves desconhecidas são ignoradas. */
export function coerceMediaAdjustments(value: unknown): ProfileMediaAdjustments {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>
  return {
    avatar: coerceMediaAdjust(raw.avatar),
    banner: coerceMediaAdjust(raw.banner),
    mini_banner: coerceMediaAdjust(raw.mini_banner),
  }
}

/** `true` quando o enquadramento é o padrão — usado para não gravar ruído. */
export function isDefaultAdjust(adjust: MediaAdjust): boolean {
  return adjust.x === 50 && adjust.y === 50 && adjust.zoom === 1
}

/**
 * O enquadramento traduzido para `style` de uma `<img>` que já usa
 * `object-cover`.
 *
 * `transformOrigin` acompanha o foco: aproximar precisa puxar para o ponto que
 * a pessoa escolheu, senão o zoom sempre cresceria a partir do centro e
 * desfaria o arrasto dela.
 */
export function mediaAdjustStyle(adjust: MediaAdjust): React.CSSProperties {
  const position = `${adjust.x}% ${adjust.y}%`
  if (adjust.zoom === 1) return { objectPosition: position }
  return {
    objectPosition: position,
    transform: `scale(${adjust.zoom})`,
    transformOrigin: position,
  }
}
