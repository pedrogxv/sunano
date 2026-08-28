import fs from "node:fs"
import path from "node:path"

import { createClient } from "@supabase/supabase-js"
import sharp from "sharp"

/**
 * Recompressão retroativa das imagens já no Storage.
 *
 * Os uploads novos já nascem comprimidos (ver `lib/server/image-compression.ts`),
 * mas o conteúdo antigo continua caro para sempre: na auditoria de 2026-08-28 o
 * bucket `peripherals` tinha 1235 arquivos somando 664MB (média de 550KB), e a
 * home baixava 10,5MB de imagem só para desenhar cards de 200–400px.
 *
 * Nenhum transformador roda em runtime — o otimizador da Vercel estourou a cota
 * (402) e o `render/image` do Supabase responde `403 FeatureNotEnabled` (add-on
 * pago). Por isso o arquivo precisa ser reescrito no bucket.
 *
 * **Sobrescreve no mesmo path** (`upsert`), em vez de subir com nome novo e
 * trocar a URL no banco. É o ponto central deste script: as URLs de imagem
 * aparecem em coluna dedicada (`peripherals.image_url`), em jsonb de galeria,
 * no markdown de post de blog/fórum e em `og:image` já indexado pelo Google.
 * Reescrever todas essas referências seria arriscado e certamente incompleto;
 * mantendo o path, nada no banco precisa mudar e nenhum link quebra.
 *
 * Consequência aceita: a extensão do arquivo deixa de bater com o conteúdo
 * (um `.png` passa a conter WebP). O navegador usa o `Content-Type` do
 * response, que é regravado junto — a extensão no path é irrelevante para a
 * exibição. Não é possível reverter um arquivo depois de sobrescrito, então o
 * dry-run é o padrão e o log de cada execução fica salvo.
 *
 * Uso:
 *   npx tsx scripts/compress-storage-images.ts                     # dry-run, todos os buckets
 *   npx tsx scripts/compress-storage-images.ts --bucket=peripherals
 *   npx tsx scripts/compress-storage-images.ts --limit=20          # amostra
 *   npx tsx scripts/compress-storage-images.ts --min-kb=300        # só arquivos grandes
 *   npx tsx scripts/compress-storage-images.ts --apply             # grava de verdade
 */

const BUCKETS = ["peripherals", "images", "store-banners", "comments", "support"] as const

/** Acima disso vale recomprimir; abaixo o ganho não paga a reescrita. */
const DEFAULT_MIN_BYTES = 120 * 1024

/**
 * Teto generoso e único para o backfill. Os presets por tipo de conteúdo
 * (`IMAGE_PRESETS`) valem para upload novo, onde o código sabe o que está
 * recebendo; aqui um arquivo solto no bucket pode ser card de produto, capa de
 * blog ou banner de perfil, e encolher demais um banner de topo seria pior que
 * economizar alguns KB a mais.
 */
const MAX_DIMENSION = 1600
const WEBP_QUALITY = 80

/** GIF preserva animação — `sharp` sem `animated: true` devolve um quadro só. */
const SKIP_MIME = new Set(["image/gif"])

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

function parseArgs() {
  const argv = process.argv.slice(2)
  const get = (flag: string) => argv.find((a) => a.startsWith(`${flag}=`))?.split("=")[1]
  const bucket = get("--bucket")
  const limit = get("--limit")
  const minKb = get("--min-kb")
  return {
    apply: argv.includes("--apply"),
    bucket: bucket && BUCKETS.includes(bucket as (typeof BUCKETS)[number]) ? bucket : null,
    limit: limit ? Number(limit) : null,
    minBytes: minKb ? Number(minKb) * 1024 : DEFAULT_MIN_BYTES,
  }
}

function formatKb(bytes: number) {
  return `${(bytes / 1024).toFixed(0)}KB`
}

type StorageObject = { name: string; size: number; mimetype: string }

/** Só o que este script usa do client — evita amarrar na assinatura genérica do SDK. */
type SupabaseList = (
  prefix: string,
  options: { limit: number; offset: number; sortBy: { column: string; order: string } }
) => Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>

/** O `list` do Storage devolve no máximo 100 itens por página. */
async function listAllObjects(
  db: { storage: { from: (bucket: string) => { list: SupabaseList } } },
  bucket: string
): Promise<StorageObject[]> {
  const out: StorageObject[] = []
  const pageSize = 100
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.storage
      .from(bucket)
      .list("", { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } })
    if (error) throw error
    const page = data ?? []
    for (const obj of page) {
      const meta = (obj as { metadata?: { size?: number; mimetype?: string } }).metadata
      // Entrada sem metadata é "pasta" (prefixo), não arquivo.
      if (!meta?.size) continue
      out.push({ name: obj.name, size: meta.size, mimetype: meta.mimetype ?? "" })
    }
    if (page.length < pageSize) break
  }
  return out
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
      ? "MODO: aplicando — arquivos serão SOBRESCRITOS no bucket (irreversível)\n"
      : "MODO: dry-run — nada será salvo (use --apply pra gravar)\n"
  )

  const buckets = args.bucket ? [args.bucket] : [...BUCKETS]
  const logEntries: Array<Record<string, unknown>> = []
  let totalBefore = 0
  let totalAfter = 0
  let changed = 0
  let skipped = 0
  let failed = 0

  for (const bucket of buckets) {
    let objects: StorageObject[]
    try {
      objects = await listAllObjects(db, bucket)
    } catch (error) {
      console.error(`! bucket ${bucket}: falha ao listar — ${(error as Error).message}`)
      continue
    }

    const candidates = objects
      .filter((o) => o.mimetype.startsWith("image/") && !SKIP_MIME.has(o.mimetype))
      .filter((o) => o.size >= args.minBytes)
    const rows = args.limit ? candidates.slice(0, args.limit) : candidates

    console.log(
      `\n=== ${bucket}: ${objects.length} arquivo(s), ${rows.length} candidato(s) acima de ${formatKb(args.minBytes)}`
    )

    for (const obj of rows) {
      try {
        const { data: blob, error: downloadError } = await db.storage.from(bucket).download(obj.name)
        if (downloadError || !blob) throw new Error(downloadError?.message ?? "download vazio")

        const input = Buffer.from(await blob.arrayBuffer())
        const output = await sharp(input, { failOn: "none" })
          .rotate()
          .resize({
            width: MAX_DIMENSION,
            height: MAX_DIMENSION,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer()

        if (output.byteLength >= input.byteLength) {
          skipped++
          console.log(`= ${obj.name} — já otimizada (${formatKb(input.byteLength)})`)
          continue
        }

        const saved = input.byteLength - output.byteLength
        totalBefore += input.byteLength
        totalAfter += output.byteLength
        changed++

        console.log(
          `~ ${obj.name}: ${formatKb(input.byteLength)} -> ${formatKb(output.byteLength)} ` +
            `(-${((saved / input.byteLength) * 100).toFixed(0)}%)`
        )

        logEntries.push({
          bucket,
          name: obj.name,
          before: input.byteLength,
          after: output.byteLength,
        })

        if (args.apply) {
          const { error: uploadError } = await db.storage.from(bucket).update(obj.name, output, {
            contentType: "image/webp",
            // Nomes são imutáveis (uma troca de imagem gera path novo), então
            // cachear por um ano é seguro. O padrão do Supabase é 1h.
            cacheControl: "31536000",
            upsert: true,
          })
          if (uploadError) throw new Error(uploadError.message)
        }
      } catch (error) {
        failed++
        console.error(`! ${obj.name}: ${(error as Error).message}`)
      }
    }
  }

  console.log("\n──────────────────────────────────────────")
  console.log(`recomprimidas: ${changed}   sem ganho: ${skipped}   falhas: ${failed}`)
  if (changed > 0) {
    console.log(
      `tamanho: ${(totalBefore / 1048576).toFixed(1)}MB -> ${(totalAfter / 1048576).toFixed(1)}MB ` +
        `(-${(((totalBefore - totalAfter) / totalBefore) * 100).toFixed(1)}%)`
    )
  }

  if (logEntries.length > 0) {
    const logPath = path.join(process.cwd(), `compress-storage-${Date.now()}.json`)
    fs.writeFileSync(logPath, JSON.stringify(logEntries, null, 2))
    console.log(`log: ${logPath}`)
  }

  if (!args.apply && changed > 0) {
    console.log("\nNada foi gravado. Rode de novo com --apply para aplicar.")
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
