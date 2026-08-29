import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Apaga do Storage a mídia que acabou de ser substituída.
 *
 * Por que existe: os nomes de arquivo carregam timestamp, então trocar avatar,
 * banner ou capa sempre grava um path novo — a coluna passa a apontar pro
 * arquivo novo e o antigo fica no bucket para sempre, pago e sem ninguém que o
 * exiba. Na limpeza de 2026-08-29 isso somava 468 arquivos (53MB), sendo 171
 * só de mídia de perfil trocada.
 *
 * `scripts/cleanup-orphaned-storage.ts` varre o bucket inteiro e serve como
 * rede de segurança; esta função é o outro lado, evitando que o lixo chegue a
 * existir. As duas coisas não se substituem: o script pega o que escapa por
 * um caminho não coberto (erro no meio de um fluxo, coluna nova esquecida).
 *
 * Nunca lança: sobrar arquivo no bucket é muito menos grave que derrubar a
 * troca de avatar depois de o registro já ter sido gravado.
 */

/** Buckets cujos objetos este helper pode remover. */
const PUBLIC_OBJECT_SEGMENT = "/storage/v1/object/public/"

/**
 * Path do objeto dentro do bucket, ou `null` se a URL não for do nosso Storage.
 *
 * Avatar vindo do login social (Google/Discord) e URL colada à mão caem aqui e
 * são ignorados — apagar não é sequer possível, mas o `null` evita montar um
 * path sem sentido a partir de um host de terceiro.
 */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const markerIndex = url.indexOf(PUBLIC_OBJECT_SEGMENT)
  if (markerIndex === -1) return null

  const rest = url.slice(markerIndex + PUBLIC_OBJECT_SEGMENT.length).split("?")[0]
  const slashIndex = rest.indexOf("/")
  if (slashIndex <= 0) return null

  const bucket = rest.slice(0, slashIndex)
  const path = decodeURIComponent(rest.slice(slashIndex + 1))
  if (!bucket || !path) return null
  return { bucket, path }
}

/**
 * Remove os objetos das URLs dadas, pulando qualquer uma que ainda apareça em
 * `stillReferenced`.
 *
 * A lista de referências é o que impede o caso em que duas colunas apontam pro
 * mesmo arquivo (o usuário usa a mesma imagem como banner e mini banner, ou
 * salva o perfil sem trocar a foto): apagar aí quebraria a que ficou.
 */
export async function removeReplacedStorageObjects(
  previousUrls: Array<string | null | undefined>,
  stillReferenced: Array<string | null | undefined>
): Promise<void> {
  const keep = new Set(stillReferenced.filter((url): url is string => Boolean(url)))

  const byBucket = new Map<string, string[]>()
  for (const url of previousUrls) {
    if (!url || keep.has(url)) continue
    const parsed = parseStorageUrl(url)
    if (!parsed) continue
    const paths = byBucket.get(parsed.bucket) ?? []
    paths.push(parsed.path)
    byBucket.set(parsed.bucket, paths)
  }

  if (byBucket.size === 0) return

  try {
    const db = createSupabaseAdminClient()
    await Promise.all(
      [...byBucket].map(([bucket, paths]) => db.storage.from(bucket).remove(paths))
    )
  } catch (error) {
    console.error("[storage-cleanup] falha ao remover mídia substituída:", error)
  }
}

/**
 * Remove a imagem de um registro que está sendo apagado, mas só depois de
 * confirmar no banco que nenhuma outra linha da mesma tabela a referencia.
 *
 * A checagem existe porque nada impede duas fichas de apontarem pro mesmo
 * arquivo (o admin pode colar a URL de um item existente em vez de subir a
 * foto de novo). Hoje isso não acontece em nenhuma linha, mas apagar sem
 * conferir transformaria uma duplicata futura em imagem quebrada.
 */
export async function removeImageIfUnreferenced(
  url: string | null | undefined,
  table: string,
  column: string
): Promise<void> {
  if (!url) return
  const parsed = parseStorageUrl(url)
  if (!parsed) return

  try {
    const db = createSupabaseAdminClient()
    const { count, error } = await db
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(column, url)

    // Sem uma contagem confiável, o seguro é deixar o arquivo: o
    // cleanup-orphaned-storage.ts recolhe depois.
    if (error || (count ?? 0) > 0) return

    await db.storage.from(parsed.bucket).remove([parsed.path])
  } catch (error) {
    console.error("[storage-cleanup] falha ao remover imagem de registro apagado:", error)
  }
}
