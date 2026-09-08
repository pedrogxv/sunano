import fs from "node:fs"
import path from "node:path"

import { createClient } from "@supabase/supabase-js"

/**
 * Corrige o `cacheControl` de objetos antigos do Storage para 1 ano.
 *
 * O padrão do Supabase é `max-age=3600`, e todo arquivo enviado antes de as
 * rotas de upload passarem a mandar `cacheControl` explícito ficou com essa
 * uma hora. Como os nomes no bucket são imutáveis — trocar a imagem de um
 * produto gera um path novo, com timestamp — não existe motivo para o
 * navegador revalidar de hora em hora um byte que nunca muda.
 *
 * O backfill de compressão (`compress-storage-images.ts`) já grava 1 ano nos
 * arquivos que reescreve, mas ele só toca no que está acima de 120KB: os
 * pequenos e os GIFs (pulados de propósito) continuam com 1h. Este script
 * cuida justamente desse resto.
 *
 * Diferente do de compressão, este é seguro: usa `update` com os MESMOS bytes
 * (baixa e regrava), então nenhum pixel muda — só o metadata. Ainda assim o
 * dry-run é o padrão.
 *
 * Uso:
 *   npx tsx scripts/fix-storage-cache-control.ts            # dry-run
 *   npx tsx scripts/fix-storage-cache-control.ts --apply
 */

const BUCKETS = ["peripherals", "images", "store-banners", "comments", "support"] as const
const TARGET_CACHE_CONTROL = "31536000"

function readEnvFileValue(key: string): string {
  try {
    const envPath = path.join(process.cwd(), ".env.local")
    const contents = fs.readFileSync(envPath, "utf8")
    const line = contents.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`))
    if (!line) return ""
    return line
      .slice(key.length + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "")
  } catch {
    return ""
  }
}

type StorageObject = { name: string; size: number; mimetype: string; cacheControl: string }

/**
 * Só o que este script usa do client — evita amarrar na assinatura genérica
 * do SDK, que muda de forma conforme os genéricos de schema (mesmo motivo do
 * tipo equivalente em `compress-storage-images.ts`).
 */
type SupabaseList = (
  prefix: string,
  options: { limit: number; offset: number; sortBy: { column: string; order: string } }
) => Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>

/** O `.list()` do Storage não é recursivo — precisa descer nos prefixos. */
async function listAllObjects(
  db: { storage: { from: (bucket: string) => { list: SupabaseList } } },
  bucket: string,
  prefix = ""
): Promise<StorageObject[]> {
  const out: StorageObject[] = []
  const pageSize = 100
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } })
    if (error) throw error
    const page = data ?? []
    for (const obj of page) {
      const meta = (obj as { metadata?: { size?: number; mimetype?: string; cacheControl?: string } })
        .metadata
      const fullPath = prefix ? `${prefix}/${obj.name}` : obj.name
      if (!meta?.size) {
        out.push(...(await listAllObjects(db, bucket, fullPath)))
        continue
      }
      out.push({
        name: fullPath,
        size: meta.size,
        mimetype: meta.mimetype ?? "",
        cacheControl: meta.cacheControl ?? "",
      })
    }
    if (page.length < pageSize) break
  }
  return out
}

async function main() {
  const apply = process.argv.includes("--apply")

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || readEnvFileValue("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvFileValue("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.")
    process.exit(1)
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(
    apply
      ? "MODO: aplicando — metadata será regravado (bytes idênticos)\n"
      : "MODO: dry-run — nada será salvo (use --apply pra gravar)\n"
  )

  let changed = 0
  let failed = 0

  for (const bucket of BUCKETS) {
    let objects: StorageObject[]
    try {
      objects = await listAllObjects(db, bucket)
    } catch (error) {
      console.error(`! bucket ${bucket}: ${(error as Error).message}`)
      continue
    }

    const stale = objects.filter((o) => o.cacheControl !== `max-age=${TARGET_CACHE_CONTROL}`)
    console.log(`\n=== ${bucket}: ${objects.length} arquivo(s), ${stale.length} com cache curto`)

    for (const obj of stale) {
      try {
        if (apply) {
          // Regrava os MESMOS bytes: só o cacheControl muda.
          const { data: blob, error: downloadError } = await db.storage
            .from(bucket)
            .download(obj.name)
          if (downloadError || !blob) throw new Error(downloadError?.message ?? "download vazio")

          const bytes = Buffer.from(await blob.arrayBuffer())
          const { error: uploadError } = await db.storage.from(bucket).update(obj.name, bytes, {
            contentType: obj.mimetype,
            cacheControl: TARGET_CACHE_CONTROL,
            upsert: true,
          })
          if (uploadError) throw new Error(uploadError.message)
        }
        changed++
        console.log(`~ ${obj.name}: ${obj.cacheControl || "(vazio)"} -> max-age=${TARGET_CACHE_CONTROL}`)
      } catch (error) {
        failed++
        console.error(`! ${obj.name}: ${(error as Error).message}`)
      }
    }
  }

  console.log("\n──────────────────────────────────────────")
  console.log(`atualizados: ${changed}   falhas: ${failed}`)
  if (!apply && changed > 0) console.log("\nNada foi gravado. Rode de novo com --apply para aplicar.")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
