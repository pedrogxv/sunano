/**
 * Gráfico de velocidade (Lento ↔ Rápido) × textura (Liso ↔ Texturizado) de
 * mousepads, glasspads e feet.
 *
 * A posição de cada periférico é colocada à mão pelo admin, arrastando a foto
 * no plano (aba "Velocidade" do board em /admin/tierlist), e não derivada dos
 * selects "Velocidade"/"Deslize" do formulário: aqueles têm três degraus, e o
 * gráfico só serve se der para dizer que um pad é um pouco mais rápido que o
 * outro do mesmo degrau.
 *
 * Mora em `specs`, em duas chaves numéricas de 0 a 100. O prefixo `admin` é
 * obrigatório: o PATCH do formulário substitui `specs` inteiro e só preserva o
 * que começa com `admin` (ver `boardSpecs` em app/admin/tierlist/form.tsx).
 * Sem as duas chaves, o item não aparece no gráfico.
 */

export const SPEED_CHART_CATEGORIES = ["mousepad", "glasspad", "feet"] as const

export const SPEED_CHART_SPEED_KEY = "adminSpeedChartSpeed"
export const SPEED_CHART_TEXTURE_KEY = "adminSpeedChartTexture"

/** `speed`: 0 = lento, 100 = rápido. `texture`: 0 = liso, 100 = texturizado. */
export type SpeedChartPoint = { speed: number; texture: number }

export function hasSpeedChart(category: string): boolean {
  return (SPEED_CHART_CATEGORIES as readonly string[]).includes(category)
}

function clampAxis(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10
}

export function readSpeedChartPoint(specs: Record<string, unknown> | null | undefined): SpeedChartPoint | null {
  const speed = specs?.[SPEED_CHART_SPEED_KEY]
  const texture = specs?.[SPEED_CHART_TEXTURE_KEY]
  if (typeof speed !== "number" || !Number.isFinite(speed)) return null
  if (typeof texture !== "number" || !Number.isFinite(texture)) return null
  return { speed: clampAxis(speed), texture: clampAxis(texture) }
}

/**
 * Valor na escala de 0 a 10 que os eixos mostram, com uma casa ("6,2"). O
 * banco guarda 0–100 (posição em % no plano); a escala é só de leitura, e
 * mudar o número de marcas no eixo não exige regravar nada.
 */
export function formatSpeedChartValue(value: number, locale = "pt-BR"): string {
  return (value / 10).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/**
 * Rótulo do marcador: o nome sem a marca na frente quando ele começa por ela
 * ("Aimstar Gentian V1" vira "Gentian V1"). No card de ~80px cabem 2 ou 3
 * linhas, e a marca repetida gastava justo o espaço que diferencia um pad do
 * outro: os pads de uma marca viravam todos "Aimstar Gentian…", "Aimstar
 * Justice…". A marca continua no tooltip e na ficha.
 */
export function speedChartLabel(name: string, brand: string): string {
  const full = name.trim()
  const prefix = brand.trim()
  if (prefix && full.toLowerCase().startsWith(`${prefix.toLowerCase()} `)) {
    const model = full.slice(prefix.length).trim()
    // Collab ("ATK x Pokemon Collab") fica inteira: sem a marca, sobrava "x Pokemon Collab".
    if (model && !/^x\s/i.test(model)) return model
  }
  return full
}

/** `null` tira o item do gráfico. Devolve um objeto novo, nunca muta `specs`. */
export function withSpeedChartPoint<T extends Record<string, unknown>>(specs: T, point: SpeedChartPoint | null): T {
  const next: Record<string, unknown> = { ...specs }
  if (point) {
    next[SPEED_CHART_SPEED_KEY] = clampAxis(point.speed)
    next[SPEED_CHART_TEXTURE_KEY] = clampAxis(point.texture)
  } else {
    delete next[SPEED_CHART_SPEED_KEY]
    delete next[SPEED_CHART_TEXTURE_KEY]
  }
  return next as T
}
