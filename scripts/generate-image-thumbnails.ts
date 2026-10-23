import fs from "node:fs"
import path from "node:path"

import { createClient } from "@supabase/supabase-js"

import { renderThumbnail } from "../lib/server/image-thumbnail-render"
import {
  isThumbnailablePath,
  THUMB_BUCKETS,
  THUMB_PREFIX,
  THUMB_WIDTHS,
  thumbObjectPath,
} from "../lib/storage-thumb"

/**
 * Gera as miniaturas (`lib/storage-thumb.ts`) das imagens que já estavam no
 * Storage antes de o upload passar a gerá-las.
 *
 * Sem isso o site continua funcionando — o script inline do layout troca a
 * miniatura ausente pelo original —, mas continua pesado: a página tenta a
 * miniatura, leva 404 e só então baixa o arquivo cheio. Rode UMA VEZ depois
 * do deploy (ou antes, tanto faz: as miniaturas não são lidas por ninguém até
 * o código novo entrar no ar).
 *
 * Idempotente: pula a imagem cujas miniaturas já existem (confere listando
 * `_thumbs/w<largura>/<pasta>` uma vez por pasta). `--force` regrava todas.
 * Não toca no original.
 *
 * Uso:
 *   npx tsx scripts/generate-image-thumbnails.ts                    # dry-run
 *   npx tsx scripts/generate-image-thumbnails.ts --bucket=images
 *   npx tsx scripts/generate-image-thumbnails.ts --limit=20 --apply # amostra
 *   npx tsx scripts/generate-image-thumbnails.ts --apply            # grava
 *   npx tsx scripts/generate-image-thumbnails.ts --apply --force    # regrava tudo
 */

const CONCURRENCY = 4

function readEnvFileValue(key: string): string {
  try {
    const contents = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
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

function parseArgs() {
  const argv = process.argv.slice(2)
  const get = (flag: string) => argv.find((a) => a.startsWith(`${flag}=`))?.split("=")[1]
  const bucket = get("--bucket")
  const limit = get("--limit")
  return {
    apply: argv.includes("--apply"),
    force: argv.includes("--force"),
    bucket:
      bucket && (THUMB_BUCKETS as readonly string[]).includes(bucket) ? bucket : null,
    limit: limit ? Number(limit) : null,
  }
}

type StorageObject = { name: string; size: number; mimetype: string }

type SupabaseList = (
  prefix: string,
  options: { limit: number; offset: number; sortBy: { column: string; order: string } }
) => Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>

type ListClient = { storage: { from: (bucket: string) => { list: SupabaseList } } }

/**
 * Lista recursiva (o `list` do Storage NÃO desce em pastas — ver
 * `compress-storage-images.ts`). `_thumbs/` fica de fora: miniatura de
 * miniatura não existe.
 */
async function listAllObjects(db: ListClient, bucket: string, prefix = ""): Promise<StorageObject[]> {
  const out: StorageObject[] = []
  const pageSize = 100
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } })
    if (error) throw error
    const page = data ?? []
    for (const obj of page) {
      const meta = (obj as { metadata?: { size?: number; mimetype?: string } }).metadata
      const fullPath = prefix ? `${prefix}/${obj.name}` : obj.name
      if (!meta?.size) {
        if (fullPath === THUMB_PREFIX) continue
        out.push(...(await listAllObjects(db, bucket, fullPath)))
        continue
      }
      out.push({ name: fullPath, size: meta.size, mimetype: meta.mimetype ?? "" })
    }
    if (page.length < pageSize) break
  }
  return out
}

/** Nomes de arquivo de uma pasta (só o nível dela). Pasta inexistente = vazio. */
async function listFileNames(db: ListClient, bucket: string, prefix: string): Promise<Set<string>> {
  const names = new Set<string>()
  const pageSize = 100
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } })
    if (error) return names
    const page = data ?? []
    for (const obj of page) names.add(obj.name)
    if (page.length < pageSize) break
  }
  return names
}

async function main() {
  const args = parseArgs()

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || readEnvFileValue("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvFileValue("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias (ambiente ou .env.local)."
    )
    process.exit(1)
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(
    args.apply
      ? `MODO: aplicando${args.force ? " (--force: regrava as existentes)" : ""}\n`
      : "MODO: dry-run — nada será gravado (use --apply)\n"
  )

  const buckets = args.bucket ? [args.bucket] : [...THUMB_BUCKETS]
  let generated = 0
  let skipped = 0
  let failed = 0
  let bytesOriginal = 0
  let bytesThumbs = 0

  for (const bucket of buckets) {
    let objects: StorageObject[]
    try {
      objects = await listAllObjects(db, bucket)
    } catch (error) {
      console.error(`! bucket ${bucket}: falha ao listar — ${(error as Error).message}`)
      continue
    }

    const images = objects.filter(
      (o) => o.mimetype.startsWith("image/") && o.mimetype !== "image/svg+xml" && isThumbnailablePath(o.name)
    )

    // Uma listagem por pasta de miniatura, reaproveitada por todas as imagens dela.
    const existingByDir = new Map<string, Set<string>>()
    async function thumbExists(objectPath: string): Promise<boolean> {
      const full = thumbObjectPath(objectPath, THUMB_WIDTHS[THUMB_WIDTHS.length - 1])
      const slash = full.lastIndexOf("/")
      const dir = full.slice(0, slash)
      let names = existingByDir.get(dir)
      if (!names) {
        names = await listFileNames(db, bucket, dir)
        existingByDir.set(dir, names)
      }
      return names.has(full.slice(slash + 1))
    }

    const pending: StorageObject[] = []
    for (const obj of images) {
      if (!args.force && (await thumbExists(obj.name))) {
        skipped++
        continue
      }
      pending.push(obj)
    }
    const rows = args.limit ? pending.slice(0, args.limit) : pending

    console.log(
      `\n=== ${bucket}: ${images.length} imagem(ns), ${images.length - pending.length} já com miniatura, ${rows.length} a gerar`
    )

    let cursor = 0
    async function worker() {
      while (cursor < rows.length) {
        const obj = rows[cursor++]
        try {
          const { data: blob, error: downloadError } = await db.storage.from(bucket).download(obj.name)
          if (downloadError || !blob) throw new Error(downloadError?.message ?? "download vazio")
          const input = Buffer.from(await blob.arrayBuffer())
          const animated = obj.mimetype === "image/gif"

          const sizes: string[] = []
          for (const width of THUMB_WIDTHS) {
            const thumb = await renderThumbnail(input, width, animated)
            sizes.push(`w${width}=${(thumb.byteLength / 1024).toFixed(0)}KB`)
            bytesThumbs += width === 256 ? thumb.byteLength : 0
            if (args.apply) {
              const { error } = await db.storage.from(bucket).upload(thumbObjectPath(obj.name, width), thumb, {
                contentType: "image/webp",
                // Mesmo valor de IMMUTABLE_CACHE_CONTROL (image-compression.ts,
                // que é server-only): o path da miniatura nunca muda de conteúdo.
                cacheControl: "31536000",
                upsert: args.force,
              })
              if (error && !/exists|Duplicate/i.test(error.message)) throw new Error(error.message)
            }
          }
          bytesOriginal += input.byteLength
          generated++
          console.log(`+ ${obj.name} (${(input.byteLength / 1024).toFixed(0)}KB): ${sizes.join(" ")}`)
        } catch (error) {
          failed++
          console.error(`! ${obj.name}: ${(error as Error).message}`)
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  }

  console.log("\n──────────────────────────────────────────")
  console.log(`geradas: ${generated}   já existiam: ${skipped}   falhas: ${failed}`)
  if (generated > 0) {
    console.log(
      `originais somam ${(bytesOriginal / 1048576).toFixed(1)}MB; ` +
        `as mesmas imagens em w256 somam ${(bytesThumbs / 1048576).toFixed(1)}MB`
    )
  }
  if (!args.apply && generated > 0) {
    console.log("\nNada foi gravado. Rode de novo com --apply.")
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
