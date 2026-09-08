"use client"

/**
 * Compressão de imagem no navegador antes do upload.
 *
 * Fotos de câmera costumam vir bem maiores que o necessário para exibição, e
 * todo upload que passa por rota tem um teto de corpo (ver
 * `lib/upload-limits.ts`). Um arquivo acima dele nunca chega a rodar a
 * validação do endpoint: a plataforma rejeita antes, com uma resposta que não
 * é JSON, e o front cai no erro genérico. Reduzir aqui evita depender do
 * tamanho original da foto.
 *
 * GIF nunca passa por aqui: redesenhar num canvas devolve um único quadro e
 * o banner animado VIP chegaria parado no bucket — mesmo motivo do
 * enquadramento não-destrutivo em lib/profile-media-adjust.ts.
 */

const SKIP_MIME_TYPES = new Set(["image/gif"])

export interface CompressImageOptions {
  /** Maior dimensão (largura ou altura) da saída, em px. */
  maxDimension: number
  /** Tamanho alvo em bytes — a qualidade cai em passos até respeitar isso. */
  targetBytes: number
  /** Só comprime se o arquivo original já passar disso. */
  skipBelowBytes: number
  /**
   * Mantém o canal alpha: a saída sai em PNG em vez de JPEG. Para imagem que
   * é sobreposta a outra coisa (moldura de avatar), o fundo transparente É o
   * formato — reencodar pra JPEG pinta o fundo de preto e o item chega
   * inutilizável no bucket. PNG não tem parâmetro de qualidade, então o
   * `targetBytes` deixa de ser garantido: o redimensionamento é a única
   * alavanca, e o que sobrar do limite ainda é barrado pelo chamador.
   */
  preserveTransparency?: boolean
}

/**
 * Retorna um File comprimido (JPEG, ou PNG com `preserveTransparency`) ou o
 * original, quando não vale a pena mexer (já pequeno, GIF, ou se o canvas
 * falhar por qualquer motivo — nesse caso a validação do servidor ainda pega
 * o que passar do limite).
 */
export async function compressImageFile(file: File, options: CompressImageOptions): Promise<File> {
  if (SKIP_MIME_TYPES.has(file.type) || file.size <= options.skipBelowBytes) {
    return file
  }

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, options.maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    let blob: Blob | null = null
    if (options.preserveTransparency) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
    } else {
      for (let quality = 0.9; quality >= 0.5; quality -= 0.1) {
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))
        if (blob && blob.size <= options.targetBytes) break
      }
    }

    if (!blob || blob.size >= file.size) return file

    const extension = options.preserveTransparency ? "png" : "jpg"
    const mime = options.preserveTransparency ? "image/png" : "image/jpeg"
    const name = file.name.replace(/\.[^.]+$/, "") + "." + extension
    return new File([blob], name, { type: mime })
  } catch {
    return file
  }
}
