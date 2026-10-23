import sharp from "sharp"

import type { ThumbWidth } from "@/lib/storage-thumb"

/**
 * O desenho da miniatura, separado de `image-thumbnails.ts` só para não
 * importar `server-only`: o backfill (`scripts/generate-image-thumbnails.ts`)
 * roda no `tsx`, fora do React, e precisa gerar EXATAMENTE a mesma miniatura
 * que o upload gera. Uma cópia da função no script divergiria na primeira
 * mudança de qualidade.
 */

/** Qualidade das miniaturas: a mesma dos presets de upload, sem perda visível no tamanho exibido. */
export const THUMB_QUALITY = 80

/** Uma miniatura WebP de `width` px de largura. GIF vira WebP animado. */
export async function renderThumbnail(
  bytes: Uint8Array | Buffer,
  width: ThumbWidth,
  animated: boolean
): Promise<Buffer> {
  const pipeline = sharp(bytes, { failOn: "none", animated })
  // `rotate()` aplica a orientação EXIF; não existe em imagem animada (GIF não tem EXIF).
  if (!animated) pipeline.rotate()
  return pipeline
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer()
}
