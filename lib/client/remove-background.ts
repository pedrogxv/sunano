"use client"

/**
 * Remoção de fundo algorítmica (sem IA, 100% local no navegador).
 *
 * Estratégia: detecta a cor de fundo dominante pelas bordas da imagem e faz um
 * flood-fill a partir das bordas, removendo apenas a região de fundo conectada
 * às extremidades. Isso preserva áreas claras dentro do produto (ex.: keycaps
 * brancos) que não estão ligadas ao fundo. Funciona bem em fotos de produto com
 * fundo sólido/uniforme (branco, cinza, etc.).
 *
 * O contorno não é binário: numa foto real os pixels da borda são uma mistura
 * do produto com o fundo, e é essa mistura que vira alpha parcial (cobertura)
 * aqui -- ver `applyBackgroundRemoval`. Sem isso o recorte sai em "escada",
 * porque cada pixel só poderia ser 100% produto ou 100% fundo.
 */

export interface RemoveBackgroundOptions {
  /** Distância de cor (0-441) para considerar um pixel como fundo. */
  tolerance?: number
  /** Largura mínima (em distância de cor) da rampa de alpha na borda. */
  feather?: number
  /** Maior dimensão (px) da saída; imagens maiores são reduzidas proporcionalmente. */
  maxDimension?: number
  /**
   * Menor dimensão (px) em que a máscara é calculada. Fotos de produto chegam
   * bem pequenas (as da Loja têm ~300px de lado) e são exibidas bem maiores que
   * isso -- na página do produto o quadro passa de 500px e o lightbox de 900px.
   * Nessa escala cada degrau da máscara vira 3-4px na tela. Calcular a máscara
   * numa grade mais fina (supersampling) deixa o contorno com precisão
   * sub-pixel no tamanho em que a imagem é realmente vista.
   */
  minDimension?: number
  /** Margem uniforme ao redor do produto após o recorte, em % da maior dimensão do conteúdo. */
  paddingRatio?: number
  /**
   * Magnitude de gradiente local (Sobel) acima da qual um pixel nunca é
   * admitido como fundo, mesmo dentro do `tolerance` de cor. Opcional -- sem
   * isso o comportamento é idêntico ao modo padrão. Ajuda a preservar traços
   * finos de baixo contraste (ex.: linework claro sobre fundo branco).
   */
  edgeThreshold?: number
  /** 'chroma' enxerga bordas de matiz (mais caro); 'luma' só de luminância. */
  edgeMode?: "luma" | "chroma"
  /**
   * Dilata a "parede" de borda em N pixels antes do flood-fill. Fecha
   * vazamentos causados por contornos de ~1px (um flood-fill 4-conectado
   * sempre consegue atravessar uma parede diagonal de 1px). Só tem efeito
   * junto com `edgeThreshold`.
   */
  wallDilate?: number
  /**
   * Fração de `tolerance` abaixo da qual a cobertura é considerada zero.
   * Quanto menor, mais fiel é a rampa da borda -- e mais fácil é uma sombra
   * suave ou ruído de JPEG no fundo sobreviver como um halo fino. 0.5 é o
   * meio-termo medido entre as duas coisas.
   */
  edgeFloorRatio?: number
  /**
   * Recalcula a cor dos pixels de borda tirando o fundo que está misturado
   * neles. Sem isso a borda continua com a cor do fundo original (uma franja
   * branca em volta de um produto escuro, por exemplo), que aparece como
   * contorno claro quando a foto é exibida sobre o card escuro.
   */
  decontaminate?: boolean
}

const DEFAULTS: Required<RemoveBackgroundOptions> = {
  tolerance: 42,
  feather: 28,
  maxDimension: 2000,
  minDimension: 1400,
  paddingRatio: 0.04,
  edgeThreshold: 0,
  edgeMode: "chroma",
  wallDilate: 0,
  edgeFloorRatio: 0.5,
  decontaminate: true,
}

/**
 * Teto do supersampling. Uma foto de 200px levada a 1400px seria 7x de
 * ampliação -- muito arquivo para pouca informação nova; 3x já coloca o
 * contorno abaixo do pixel na tela.
 */
const MAX_UPSCALE = 3

/** Largura da faixa de borda (px na resolução de trabalho, escalada pelo supersampling). */
const EDGE_BAND_PX = 2

/** Raio da janela que estima a cor "pura" do produto ao lado de cada borda. */
const CONTRAST_RADIUS_PX = 4

/**
 * Preset "remoção mais forte": pra fotos com arte de baixo contraste sobre
 * fundo bem liso (ex.: linework claro em papel branco) onde o modo padrão
 * come partes do desenho. Mais agressivo -- pode sub-remover fundos com
 * textura própria (ex.: papel com riscos/sombreado visível), por isso não é
 * o padrão.
 */
export const STRONG_REMOVAL_OPTIONS: RemoveBackgroundOptions = {
  edgeThreshold: 30,
  edgeMode: "chroma",
  wallDilate: 16,
}

interface RGB {
  r: number
  g: number
  b: number
}

/**
 * Recebe o arquivo de imagem selecionado e devolve um novo `File` PNG com o
 * fundo transparente. Lança erro se o canvas não estiver disponível.
 */
export async function removeBackground(
  file: File,
  options: RemoveBackgroundOptions = {}
): Promise<File> {
  const {
    tolerance,
    feather,
    maxDimension,
    minDimension,
    paddingRatio,
    edgeThreshold,
    edgeMode,
    wallDilate,
    edgeFloorRatio,
    decontaminate,
  } = {
    ...DEFAULTS,
    ...options,
  }

  const bitmap = await loadBitmap(file)
  const scale = workingScale(bitmap.width, bitmap.height, maxDimension, minDimension)
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))

  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) {
    bitmap.close?.()
    throw new Error("Canvas 2D não suportado neste navegador.")
  }

  // A qualidade padrão do redimensionamento do canvas é "low"; num recorte a
  // borda é justamente o que interessa, então vale o custo do filtro melhor.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  applyBackgroundRemoval(image, {
    tolerance,
    feather,
    edgeThreshold,
    edgeMode,
    wallDilate,
    edgeFloorRatio,
    decontaminate,
    bandPx: Math.max(EDGE_BAND_PX, Math.round(EDGE_BAND_PX * scale)),
    contrastRadius: Math.max(CONTRAST_RADIUS_PX, Math.round(CONTRAST_RADIUS_PX * scale)),
  })
  ctx.putImageData(image, 0, 0)

  // Recorta a área vazia ao redor do produto. Sem isso, o quanto o produto
  // ocupa da imagem final varia de acordo com a margem da foto original,
  // fazendo cards do mesmo tamanho exibirem produtos em tamanhos bem diferentes
  // (ex.: foto com bastante fundo aparece minúscula perto de uma foto "fechada").
  const finalCanvas = cropToContent(canvas, image, paddingRatio)

  const blob = await canvasToBlob(finalCanvas)
  const name = `${stripExtension(file.name)}.png`
  return new File([blob], name, { type: "image/png" })
}

/**
 * Escala em que a máscara é calculada: reduz o que passa de `maxDimension`
 * (PNG com transparência é pesado) e amplia o que não chega em `minDimension`,
 * até o teto de `MAX_UPSCALE`.
 */
function workingScale(
  width: number,
  height: number,
  maxDimension: number,
  minDimension: number
): number {
  const longest = Math.max(width, height)
  const scale = Math.min(1, maxDimension / longest)
  if (minDimension <= 0) return scale
  return Math.max(scale, Math.min(minDimension / longest, MAX_UPSCALE))
}

/**
 * Recorta o canvas para o bounding box dos pixels não-transparentes (o
 * produto em si), com uma margem uniforme ao redor. Devolve o próprio canvas
 * original se não houver o que recortar (imagem sem fundo removido, ou já
 * ocupando o quadro inteiro).
 */
function cropToContent(
  canvas: HTMLCanvasElement,
  image: ImageData,
  paddingRatio: number
): HTMLCanvasElement {
  const bounds = findContentBounds(image)
  if (!bounds) return canvas

  const contentWidth = bounds.x1 - bounds.x0 + 1
  const contentHeight = bounds.y1 - bounds.y0 + 1
  const pad = Math.round(Math.max(contentWidth, contentHeight) * paddingRatio)

  const cropX = Math.max(0, bounds.x0 - pad)
  const cropY = Math.max(0, bounds.y0 - pad)
  const cropWidth = Math.min(canvas.width, bounds.x1 + 1 + pad) - cropX
  const cropHeight = Math.min(canvas.height, bounds.y1 + 1 + pad) - cropY

  // Já ocupa o quadro inteiro (ou quase) — não vale a pena recortar.
  if (cropWidth >= canvas.width && cropHeight >= canvas.height) return canvas

  const cropped = document.createElement("canvas")
  cropped.width = cropWidth
  cropped.height = cropHeight
  const croppedCtx = cropped.getContext("2d")
  if (!croppedCtx) return canvas

  croppedCtx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
  return cropped
}

/** Bounding box (inclusivo) dos pixels com alpha acima do ruído do feather das bordas. */
function findContentBounds(
  image: ImageData,
  alphaThreshold = 8
): { x0: number; y0: number; x1: number; y1: number } | null {
  const { data, width, height } = image
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= alphaThreshold) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }

  return x1 < x0 || y1 < y0 ? null : { x0, y0, x1, y1 }
}

/**
 * Magnitude de gradiente (Sobel), usada como sinal de "isso aqui é
 * detalhe/traço" independente da distância de cor até o fundo. 'chroma' roda
 * o Sobel em R, G e B separadamente e pega o maior dos três por pixel --
 * enxerga bordas de matiz (ex.: rosa claro sobre branco) que 'luma' perde por
 * terem luminância quase igual.
 */
function computeEdgeMagnitude(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mode: "luma" | "chroma"
): Float32Array {
  const channels: Float32Array[] = []
  if (mode === "chroma") {
    const r = new Float32Array(width * height)
    const g = new Float32Array(width * height)
    const b = new Float32Array(width * height)
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      r[p] = data[i]
      g[p] = data[i + 1]
      b[p] = data[i + 2]
    }
    channels.push(r, g, b)
  } else {
    const lum = new Float32Array(width * height)
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    }
    channels.push(lum)
  }

  const mag = new Float32Array(width * height)
  for (const chan of channels) {
    const at = (x: number, y: number) => chan[y * width + x]
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const gx =
          -at(x - 1, y - 1) + at(x + 1, y - 1) +
          -2 * at(x - 1, y) + 2 * at(x + 1, y) +
          -at(x - 1, y + 1) + at(x + 1, y + 1)
        const gy =
          -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
          at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)
        const m = Math.sqrt(gx * gx + gy * gy)
        const idx = y * width + x
        if (m > mag[idx]) mag[idx] = m
      }
    }
  }
  return mag
}

/**
 * Dilatação morfológica (kernel "+") de uma máscara binária. Fecha
 * vazamentos de 1px: um flood-fill 4-conectado sempre consegue atravessar
 * uma parede diagonal de 1px de espessura (geometria de raster, não falta de
 * contraste) -- engordar a parede pra >=2px em qualquer ponto elimina esse
 * tipo de vazamento.
 */
function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  let current = mask
  for (let step = 0; step < radius; step++) {
    const next = new Uint8Array(current.length)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        if (
          current[idx] ||
          (x > 0 && current[idx - 1]) ||
          (x < width - 1 && current[idx + 1]) ||
          (y > 0 && current[idx - width]) ||
          (y < height - 1 && current[idx + width])
        ) {
          next[idx] = 1
        }
      }
    }
    current = next
  }
  return current
}

interface RemovalParams {
  tolerance: number
  feather: number
  edgeThreshold: number
  edgeMode: "luma" | "chroma"
  wallDilate: number
  edgeFloorRatio: number
  decontaminate: boolean
  bandPx: number
  contrastRadius: number
}

function applyBackgroundRemoval(image: ImageData, params: RemovalParams) {
  const {
    tolerance,
    feather,
    edgeThreshold,
    edgeMode,
    wallDilate,
    edgeFloorRatio,
    decontaminate,
    bandPx,
    contrastRadius,
  } = params
  const { data, width, height } = image
  const bg = estimateBackgroundColor(data, width, height)
  const total = width * height

  // Distância de cor até o fundo, por pixel. É o sinal que decide tanto o
  // recorte quanto a cobertura da borda, então vale calcular uma vez só.
  const dist = new Float32Array(total)
  for (let idx = 0; idx < total; idx++) {
    const o = idx << 2
    const dr = data[o] - bg.r
    const dg = data[o + 1] - bg.g
    const db = data[o + 2] - bg.b
    dist[idx] = Math.sqrt(dr * dr + dg * dg + db * db)
  }

  // "Parede" opcional: pixels com gradiente local acima do threshold nunca
  // são admitidos como fundo, mesmo dentro do tolerance de cor. Desligado
  // por padrão (edgeThreshold 0) -- comportamento idêntico ao modo padrão.
  let wall: Uint8Array | null = null
  if (edgeThreshold > 0) {
    const edgeMag = computeEdgeMagnitude(data, width, height, edgeMode)
    wall = new Uint8Array(total)
    for (let i = 0; i < total; i++) if (edgeMag[i] > edgeThreshold) wall[i] = 1
    if (wallDilate > 0) wall = dilateMask(wall, width, height, wallDilate)
  }

  // 1 = pixel de fundo (conectado às bordas)
  const mask = new Uint8Array(total)
  const stack: number[] = []

  const seed = (x: number, y: number) => {
    const idx = y * width + x
    if (!mask[idx] && dist[idx] <= tolerance && !(wall && wall[idx])) {
      mask[idx] = 1
      stack.push(idx)
    }
  }

  // Semeia a partir de todos os pixels das bordas.
  for (let x = 0; x < width; x++) {
    seed(x, 0)
    seed(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    seed(0, y)
    seed(width - 1, y)
  }

  // Flood-fill 4-conectado: expande pela região de fundo similar.
  while (stack.length) {
    const idx = stack.pop() as number
    const x = idx % width
    const y = (idx / width) | 0
    if (x > 0) seed(x - 1, y)
    if (x < width - 1) seed(x + 1, y)
    if (y > 0) seed(x, y - 1)
    if (y < height - 1) seed(x, y + 1)
  }

  // Faixa de borda: os pixels dos dois lados do contorno do flood-fill. Numa
  // foto real esses pixels são uma mistura do produto com o fundo, e é neles
  // (e só neles) que o alpha é parcial. Pegar os dois lados importa: se só o
  // lado de dentro entrasse, todo pixel com menos de ~50% de produto cairia
  // no fundo e o recorte comeria meio pixel do contorno inteiro.
  const inverse = new Uint8Array(total)
  for (let i = 0; i < total; i++) inverse[i] = mask[i] ? 0 : 1
  const grownMask = dilateMask(mask, width, height, bandPx)
  const grownInverse = dilateMask(inverse, width, height, bandPx)
  const band = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    // A parede de detalhe fino nunca entra na faixa: ela existe justamente
    // para segurar traços que o tolerance sozinho apagaria.
    if (wall && wall[i]) continue
    if ((grownMask[i] && !mask[i]) || (mask[i] && grownInverse[i])) band[i] = 1
  }

  // Distância de cor do produto "puro" perto de cada borda. É o denominador
  // da cobertura: um pixel de borda vale `dist / distDoProduto`, porque a
  // mistura com o fundo é proporcional ao contraste local. Um valor fixo aqui
  // (o `feather` sozinho) assume que todo produto é quase da cor do fundo --
  // num produto escuro sobre branco a rampa acaba em 2 pixels e o que sobra é
  // uma franja branca dura em vez de uma borda.
  const pureDist = new Float32Array(total)
  const pureHits = new Float32Array(total)
  for (let i = 0; i < total; i++) {
    if (mask[i] || band[i]) continue
    pureDist[i] = dist[i]
    pureHits[i] = 1
  }
  const localSum = boxBlur2D(pureDist, width, height, contrastRadius)
  const localCount = boxBlur2D(pureHits, width, height, contrastRadius)

  const floor = tolerance * edgeFloorRatio
  const minSpan = tolerance + feather - floor

  for (let idx = 0; idx < total; idx++) {
    const o = idx << 2

    if (!band[idx]) {
      if (mask[idx]) data[o + 3] = 0
      continue
    }

    const localPure = localCount[idx] > 1e-4 ? localSum[idx] / localCount[idx] : 0
    const span = Math.max(localPure - floor, minSpan)
    const coverage = Math.min(1, Math.max(0, (dist[idx] - floor) / span))
    const alpha = data[o + 3] * coverage
    data[o + 3] = Math.round(alpha)

    if (!decontaminate) continue

    // O pixel observado é `produto * a + fundo * (1 - a)`; invertendo a conta
    // recupera a cor do produto sozinha. Abaixo de a=0.15 a divisão amplifica
    // ruído, então o efeito entra em rampa e some antes disso.
    const a = alpha / 255
    if (a <= 0.15 || a >= 0.98) continue
    const weight = Math.min(1, (a - 0.15) / 0.35)
    data[o] = unmix(data[o], bg.r, a, weight)
    data[o + 1] = unmix(data[o + 1], bg.g, a, weight)
    data[o + 2] = unmix(data[o + 2], bg.b, a, weight)
  }
}

/** Remove do canal a parcela que veio do fundo, ponderada por `weight`. */
function unmix(observed: number, background: number, alpha: number, weight: number): number {
  const pure = (observed - (1 - alpha) * background) / alpha
  const clamped = pure < 0 ? 0 : pure > 255 ? 255 : pure
  return Math.round(observed * (1 - weight) + clamped * weight)
}

/** Desfoque em caixa (box blur) separável, com borda replicada nas extremidades. */
function boxBlurPass(
  src: Float32Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean
): Float32Array {
  const dst = new Float32Array(src.length)
  const size = radius * 2 + 1
  const clamp = (i: number, size2: number) => (i < 0 ? 0 : i >= size2 ? size2 - 1 : i)

  if (horizontal) {
    for (let y = 0; y < height; y++) {
      const row = y * width
      let sum = 0
      for (let k = -radius; k <= radius; k++) sum += src[row + clamp(k, width)]
      for (let x = 0; x < width; x++) {
        dst[row + x] = sum / size
        const addX = row + clamp(x + radius + 1, width)
        const removeX = row + clamp(x - radius, width)
        sum += src[addX] - src[removeX]
      }
    }
  } else {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) sum += src[clamp(k, height) * width + x]
      for (let y = 0; y < height; y++) {
        dst[y * width + x] = sum / size
        const addY = clamp(y + radius + 1, height) * width + x
        const removeY = clamp(y - radius, height) * width + x
        sum += src[addY] - src[removeY]
      }
    }
  }
  return dst
}

/** Média de janela quadrada, em duas passagens separáveis. */
function boxBlur2D(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  return boxBlurPass(boxBlurPass(src, width, height, radius, true), width, height, radius, false)
}

/**
 * Estima a cor de fundo a partir das bordas usando um histograma quantizado
 * (12 bits). Pega o balde mais frequente e tira a média real dos pixels nele,
 * o que é robusto mesmo quando parte do produto encosta na borda.
 */
function estimateBackgroundColor(
  data: Uint8ClampedArray,
  width: number,
  height: number
): RGB {
  const buckets = new Map<number, RGB & { n: number }>()

  const sample = (x: number, y: number) => {
    const o = (y * width + x) << 2
    const r = data[o]
    const g = data[o + 1]
    const b = data[o + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const entry = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
    entry.r += r
    entry.g += g
    entry.b += b
    entry.n += 1
    buckets.set(key, entry)
  }

  for (let x = 0; x < width; x++) {
    sample(x, 0)
    sample(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    sample(0, y)
    sample(width - 1, y)
  }

  let best: (RGB & { n: number }) | null = null
  for (const entry of buckets.values()) {
    if (!best || entry.n > best.n) best = entry
  }

  if (!best) return { r: 255, g: 255, b: 255 }
  return { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n }
}

async function loadBitmap(
  file: File
): Promise<ImageBitmap & { close?: () => void }> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file)
  }

  // Fallback para navegadores sem createImageBitmap.
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () =>
        reject(new Error("Não foi possível carregar a imagem."))
      el.src = url
    })
    return img as unknown as ImageBitmap & { close?: () => void }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Falha ao gerar a imagem.")),
      "image/png"
    )
  })
}

function stripExtension(name: string): string {
  return name.replace(/\.[^./\\]+$/, "")
}

/** Converte um `File`/`Blob` em data URL para preview. */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("Falha ao ler a imagem."))
    reader.readAsDataURL(file)
  })
}
