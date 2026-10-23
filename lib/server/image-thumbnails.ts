import "server-only"

import { IMMUTABLE_CACHE_CONTROL } from "@/lib/server/image-compression"
import { renderThumbnail } from "@/lib/server/image-thumbnail-render"
import {
  isThumbnailablePath,
  THUMB_BUCKETS,
  THUMB_WIDTHS,
  thumbObjectPath,
} from "@/lib/storage-thumb"

/**
 * Gera e grava as miniaturas de uma imagem recém-enviada. Ver o porquê e o
 * formato do path em `lib/storage-thumb.ts`.
 *
 * Chamada logo depois do `.upload()` do original, com os MESMOS bytes que
 * foram gravados (já comprimidos). Nunca lança: falhar aqui só deixa a tela
 * mais pesada (o fallback serve o original), e derrubar o upload por causa
 * de uma miniatura seria muito pior.
 */

/** Só o que esta função usa do client — serve ao admin client e ao client dos scripts. */
type StorageUploader = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Uint8Array | Buffer,
        options: { contentType: string; cacheControl: string; upsert: boolean }
      ) => PromiseLike<{ error: unknown }>
    }
  }
}

export async function createImageThumbnails(
  db: StorageUploader,
  bucket: string,
  path: string,
  bytes: Uint8Array | Buffer,
  mime: string,
  options: { upsert?: boolean } = {}
): Promise<void> {
  if (!(THUMB_BUCKETS as readonly string[]).includes(bucket)) return
  if (!isThumbnailablePath(path)) return

  const animated = mime === "image/gif"

  await Promise.all(
    THUMB_WIDTHS.map(async (width) => {
      try {
        const thumb = await renderThumbnail(bytes, width, animated)
        const { error } = await db.storage.from(bucket).upload(thumbObjectPath(path, width), thumb, {
          contentType: "image/webp",
          cacheControl: IMMUTABLE_CACHE_CONTROL,
          upsert: options.upsert ?? false,
        })
        if (error) throw error
      } catch (error) {
        console.error(`[image-thumbnails] ${bucket}/${path} w${width}:`, error)
      }
    })
  )
}
