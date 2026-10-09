import "server-only"

import { uploadTooLargeMessage } from "@/lib/upload-limits"

/**
 * Validação de imagens por magic bytes — o `Content-Type`/nome de um
 * multipart é definido pelo cliente e é trivial de falsificar (ex.: subir
 * HTML/SVG declarando `image/jpeg`). Confere os bytes reais do arquivo
 * contra os formatos de imagem suportados antes de aceitar o upload, e
 * deriva a extensão do tipo detectado (nunca do nome enviado pelo cliente).
 */

const SIGNATURES: Array<{ mime: string; extension: string; check: (b: Uint8Array) => boolean }> = [
  {
    mime: "image/jpeg",
    extension: "jpg",
    check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/png",
    extension: "png",
    check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: "image/gif",
    extension: "gif",
    check: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  },
  {
    mime: "image/webp",
    extension: "webp",
    check: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
]

/** Detecta o tipo real da imagem pelos primeiros bytes. `null` se não reconhecido. */
export function detectImageType(bytes: Uint8Array): { mime: string; extension: string } | null {
  for (const sig of SIGNATURES) {
    if (bytes.length >= 4 && sig.check(bytes)) {
      return { mime: sig.mime, extension: sig.extension }
    }
  }
  return null
}

/**
 * Valida um `File` de upload: checa tamanho, MIME declarado E os bytes
 * reais (magic number). Retorna a extensão a usar (derivada do conteúdo
 * real, não do nome enviado pelo cliente) ou um erro para responder ao cliente.
 */
export async function validateImageUpload(
  file: File,
  options: { maxSizeBytes: number; allowedMimeTypes: string[] }
): Promise<
  | { ok: true; extension: string; mime: string; bytes: Uint8Array }
  | { ok: false; error: string }
> {
  if (file.size > options.maxSizeBytes) {
    return { ok: false, error: uploadTooLargeMessage(options.maxSizeBytes) }
  }

  if (!options.allowedMimeTypes.includes(file.type)) {
    return { ok: false, error: "Tipo de arquivo não permitido." }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const detected = detectImageType(bytes)

  if (!detected || !options.allowedMimeTypes.includes(detected.mime)) {
    return { ok: false, error: "O conteúdo do arquivo não corresponde a uma imagem válida." }
  }

  return { ok: true, extension: detected.extension, mime: detected.mime, bytes }
}

/** Detecta MP4 pelos bytes 4-7, que são a marca ASCII "ftyp" da box de tipo do arquivo. */
// Átomos com que um .mov antigo (sem `ftyp`) costuma abrir.
const QUICKTIME_LEADING_ATOMS = new Set(["moov", "mdat", "wide", "free", "skip"])

/**
 * MP4 e MOV são o mesmo formato de caixas (ISO BMFF nasceu do QuickTime): o que
 * os separa é a marca do `ftyp` ("qt  " = QuickTime) ou, no .mov antigo, a falta
 * do `ftyp`. Quem só aceita MP4 continua recusando MOV pelo `allowedMimeTypes`.
 */
export function detectVideoType(bytes: Uint8Array): { mime: string; extension: string } | null {
  if (bytes.length < 12) return null
  const atom = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7])
  if (atom === "ftyp") {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
    return brand === "qt  "
      ? { mime: "video/quicktime", extension: "mov" }
      : { mime: "video/mp4", extension: "mp4" }
  }
  if (QUICKTIME_LEADING_ATOMS.has(atom)) {
    return { mime: "video/quicktime", extension: "mov" }
  }
  return null
}

/**
 * Valida um `File` de vídeo: checa tamanho, MIME declarado E os bytes reais
 * (magic bytes do MP4/MOV). Mesmo formato de retorno de `validateImageUpload`.
 */
export async function validateVideoUpload(
  file: File,
  options: { maxSizeBytes: number; allowedMimeTypes: string[] }
): Promise<
  | { ok: true; extension: string; mime: string; bytes: Uint8Array }
  | { ok: false; error: string }
> {
  if (file.size > options.maxSizeBytes) {
    return { ok: false, error: uploadTooLargeMessage(options.maxSizeBytes) }
  }

  if (!options.allowedMimeTypes.includes(file.type)) {
    return { ok: false, error: "Tipo de arquivo não permitido." }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const detected = detectVideoType(bytes)

  if (!detected || !options.allowedMimeTypes.includes(detected.mime)) {
    return { ok: false, error: "O conteúdo do arquivo não corresponde a um vídeo válido." }
  }

  return { ok: true, extension: detected.extension, mime: detected.mime, bytes }
}
