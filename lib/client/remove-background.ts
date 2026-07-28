"use client"

/**
 * Remoção de fundo algorítmica (sem IA, 100% local no navegador).
 *
 * Estratégia: detecta a cor de fundo dominante pelas bordas da imagem e faz um
 * flood-fill a partir das bordas, removendo apenas a região de fundo conectada
 * às extremidades. Isso preserva áreas claras dentro do produto (ex.: keycaps
 * brancos) que não estão ligadas ao fundo. Funciona bem em fotos de produto com
 * fundo sólido/uniforme (branco, cinza, etc.).
 */

export interface RemoveBackgroundOptions {
  /** Distância de cor (0-441) para considerar um pixel como fundo. */
  tolerance?: number
  /** Faixa extra de distância usada para suavizar a borda (anti-aliasing). */
  feather?: number
  /** Maior dimensão (px) da saída; imagens maiores são reduzidas proporcionalmente. */
  maxDimension?: number
  /** Margem uniforme ao redor do produto após o recorte, em % da maior dimensão do conteúdo. */
  paddingRatio?: number
}

const DEFAULTS: Required<RemoveBackgroundOptions> = {
  tolerance: 42,
  feather: 28,
  maxDimension: 2000,
  paddingRatio: 0.04,
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
  const { tolerance, feather, maxDimension, paddingRatio } = { ...DEFAULTS, ...options }

  const bitmap = await loadBitmap(file)
  // Reduz imagens muito grandes para manter o PNG (com transparência) leve e
  // o processamento rápido. Fotos de produto não precisam de mais que isso.
  const scale = Math.min(
    1,
    maxDimension / Math.max(bitmap.width, bitmap.height)
  )
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))

  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) {
    bitmap.close?.()
    throw new Error("Canvas 2D não suportado neste navegador.")
  }

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  applyBackgroundRemoval(image, tolerance, feather)
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

function applyBackgroundRemoval(
  image: ImageData,
  tolerance: number,
  feather: number
) {
  const { data, width, height } = image
  const bg = estimateBackgroundColor(data, width, height)
  const total = width * height

  // 1 = pixel de fundo (conectado às bordas)
  const mask = new Uint8Array(total)
  const stack: number[] = []

  const distance = (idx: number): number => {
    const o = idx << 2
    const dr = data[o] - bg.r
    const dg = data[o + 1] - bg.g
    const db = data[o + 2] - bg.b
    return Math.sqrt(dr * dr + dg * dg + db * db)
  }

  const seed = (x: number, y: number) => {
    const idx = y * width + x
    if (!mask[idx] && distance(idx) <= tolerance) {
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

  const touchesBackground = (idx: number, x: number, y: number): boolean =>
    (x > 0 && mask[idx - 1] === 1) ||
    (x < width - 1 && mask[idx + 1] === 1) ||
    (y > 0 && mask[idx - width] === 1) ||
    (y < height - 1 && mask[idx + width] === 1)

  // Aplica a transparência. Pixels de fundo ficam 100% transparentes; pixels
  // de borda próximos do fundo recebem alpha parcial para suavizar o recorte.
  for (let idx = 0; idx < total; idx++) {
    const o = idx << 2
    if (mask[idx]) {
      data[o + 3] = 0
      continue
    }
    if (feather <= 0) continue

    const x = idx % width
    const y = (idx / width) | 0
    if (!touchesBackground(idx, x, y)) continue

    const d = distance(idx)
    if (d <= tolerance + feather) {
      const factor = (d - tolerance) / feather // 0 = fundo, 1 = produto
      const clamped = factor < 0 ? 0 : factor > 1 ? 1 : factor
      data[o + 3] = Math.round(data[o + 3] * clamped)
    }
  }
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
