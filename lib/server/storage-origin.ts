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

  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = parsed.pathname.indexOf(marker)
  if (idx === -1) return false

  const fileName = parsed.pathname.slice(idx + marker.length)
  return fileName.length > 0 && pathPredicate(fileName)
}
