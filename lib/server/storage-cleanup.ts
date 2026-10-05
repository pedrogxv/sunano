import "server-only"

import { getStoragePublicOrigin } from "@/lib/server/storage-origin"
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

/** Um objeto do Storage: o bucket e o nome dentro dele. */
export type StorageObjectRef = { bucket: string; path: string }

/**
 * Quais objetos um fluxo pode apagar. É obrigatório em toda chamada porque a
 * URL que chega aqui é o valor ANTIGO de uma coluna, e coluna é texto que
 * alguém gravou: enquanto bastava a URL parecer do nosso Storage, qualquer
 * usuário gravava no próprio avatar a URL de um arquivo alheio (foto de
 * produto, avatar de outra pessoa, anexo do bucket privado `support`) e a
 * troca seguinte o apagava com service_role. Cada chamador declara o bucket e
 * o formato de nome que ELE gera, e só isso sai do bucket.
 */
export type CanRemoveStorageObject = (object: StorageObjectRef) => boolean

/**
 * Bucket e nome do objeto, ou `null` se a URL não for do nosso Storage.
 *
 * Avatar vindo do login social (Google/Discord) e URL colada à mão caem aqui e
 * são ignorados. A origem tem de ser a do nosso projeto e o caminho começa no
 * segmento público: procurar o segmento em qualquer ponto da string aceitava
 * `https://lh3.googleusercontent.com/storage/v1/object/public/<bucket>/<x>`,
 * que passa pela allowlist de host de OAuth e apagava `<x>` do NOSSO bucket.
 */
function parseStorageUrl(url: string): StorageObjectRef | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  // Sem a origem configurada não há como saber o que é nosso: na dúvida,
  // nada sai do bucket (o cleanup-orphaned-storage.ts recolhe depois).
  const origin = getStoragePublicOrigin()
  if (!origin || parsed.origin !== origin) return null
  if (!parsed.pathname.startsWith(PUBLIC_OBJECT_SEGMENT)) return null

  const rest = parsed.pathname.slice(PUBLIC_OBJECT_SEGMENT.length)
  const slashIndex = rest.indexOf("/")
  if (slashIndex <= 0) return null

  const bucket = rest.slice(0, slashIndex)
  let path: string
  try {
    path = decodeURIComponent(rest.slice(slashIndex + 1))
  } catch {
    return null
  }
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
  stillReferenced: Array<string | null | undefined>,
  canRemove: CanRemoveStorageObject
): Promise<void> {
  const keep = new Set(stillReferenced.filter((url): url is string => Boolean(url)))

  const byBucket = new Map<string, string[]>()
  for (const url of previousUrls) {
    if (!url || keep.has(url)) continue
    const parsed = parseStorageUrl(url)
    if (!parsed || !canRemove(parsed)) continue
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
  column: string,
  canRemove: CanRemoveStorageObject
): Promise<void> {
  if (!url) return
  const parsed = parseStorageUrl(url)
  if (!parsed || !canRemove(parsed)) return

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
