import "server-only"

/**
 * Origem pública do nosso Supabase Storage (ex.: `https://xxxx.supabase.co`).
 *
 * Usado pelas validações de "esta URL é um upload nosso?" — checar só o
 * caminho (`/storage/v1/object/public/<bucket>/<arquivo>`) deixa passar
 * `https://site-de-terceiro/storage/v1/object/public/comments/comment-<uid>-x.jpg`.
 * Prender ao host fecha isso.
 */
export function getStoragePublicOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

/**
 * `true` se `url` é um objeto público do nosso Storage cujo caminho, depois do
 * bucket, casa com `pathPredicate` (ex.: começa com `comment-<uid>-`).
 *
 * Sem `NEXT_PUBLIC_SUPABASE_URL` (só deveria acontecer em teste), cai para a
 * checagem de caminho pura — melhor que recusar todo upload legítimo.
 */
export function isOwnStorageObject(
  url: string,
  bucket: string,
  pathPredicate: (fileName: string) => boolean
): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  const origin = getStoragePublicOrigin()
  if (origin && parsed.origin !== origin) return false

  // Ancorado no início do caminho: com `indexOf`, um caminho que só CONTÉM o
  // segmento (`/storage/v1/object/public/support/x/storage/v1/object/public/
  // comments/comment-<uid>-1.png`) passava, embora o objeto de verdade fosse
  // outro, em outro bucket.
  const marker = `/storage/v1/object/public/${bucket}/`
  if (!parsed.pathname.startsWith(marker)) return false

  const fileName = parsed.pathname.slice(marker.length)
  return fileName.length > 0 && pathPredicate(fileName)
}
