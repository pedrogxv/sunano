import fs from "node:fs"
import path from "node:path"

import { createClient } from "@supabase/supabase-js"
import sharp from "sharp"

import type { Database } from "../lib/database.types"

/**
 * Recorta as imagens de periféricos já cadastrados para o bounding box do
 * produto (+ margem uniforme), corrigindo o mesmo problema que o
 * remove-background.ts agora evita em uploads novos: fotos com bastante
 * espaço vazio ao redor do produto exibem o produto minúsculo no card,
 * enquanto fotos "fechadas" preenchem o card inteiro.
 *
 * Não apaga os arquivos originais no Storage — sobe um PNG novo e só troca o
 * `image_url` no banco, então dá pra reverter manualmente usando o log salvo
 * ao final de cada execução.
 *
 * Uso:
 *   npx tsx scripts/normalize-peripheral-images.ts                  # dry-run, tudo
 *   npx tsx scripts/normalize-peripheral-images.ts --limit=5        # dry-run, amostra
 *   npx tsx scripts/normalize-peripheral-images.ts --ids=<id>,<id>  # dry-run, itens específicos
 *   npx tsx scripts/normalize-peripheral-images.ts --apply          # grava de verdade
 */

const BUCKET = "peripherals"
const PADDING_RATIO = 0.08
const TRIM_THRESHOLD = 10
// Só reprocessa se o recorte realmente reduzir a área de forma perceptível —
// evita reupload/troca de URL à toa em fotos que já são bem enquadradas.
const MIN_AREA_REDUCTION = 0.02

function readEnvFileValue(key: string): string {
  try {
    const envPath = path.join(process.cwd(), ".env.local")
    const contents = fs.readFileSync(envPath, "utf8")
    const line = contents.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`))
    if (!line) return ""
    return line.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, "")
  } catch {
    return ""
  }
}

function parseArgs() {
  const argv = process.argv.slice(2)
  const limitArg = argv.find((a) => a.startsWith("--limit="))
  const idsArg = argv.find((a) => a.startsWith("--ids="))
  return {
    apply: argv.includes("--apply"),
    limit: limitArg ? Number(limitArg.split("=")[1]) : null,
    ids: idsArg ? idsArg.split("=")[1].split(",").map((s) => s.trim()).filter(Boolean) : null,
  }
}

async function main() {
  const args = parseArgs()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || readEnvFileValue("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvFileValue("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias (ambiente ou .env.local)."
    )
    process.exit(1)
  }

  const db = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(args.apply ? "MODO: aplicando mudanças de verdade\n" : "MODO: dry-run — nada será salvo (use --apply pra gravar)\n")

  let query = db.from("peripherals").select("id,name,category,image_url").not("image_url", "is", null)
  if (args.ids) query = query.in("id", args.ids)
  const { data: peripherals, error } = await query.order("created_at", { ascending: false })
  if (error) throw error

  const rows = (args.limit ? (peripherals ?? []).slice(0, args.limit) : peripherals) ?? []
  console.log(`${rows.length} periférico(s) com imagem para avaliar.\n`)

  const logEntries: Array<Record<string, unknown>> = []
  let changed = 0
  let skipped = 0
  let failed = 0

  for (const p of rows) {
    if (!p.image_url) continue
    try {
      const res = await fetch(p.image_url)
      if (!res.ok) throw new Error(`fetch falhou: ${res.status}`)
      const inputBuffer = Buffer.from(await res.arrayBuffer())

      const originalMeta = await sharp(inputBuffer).metadata()
      // .metadata() lê o header do arquivo de ENTRADA e ignora operações
      // pendentes no pipeline — encadear .trim().metadata() devolve as
      // dimensões originais, não as do resultado. Precisa materializar via
      // .toBuffer() pra saber o tamanho real após o trim.
      const trimmedResult = await sharp(inputBuffer)
        .trim({ threshold: TRIM_THRESHOLD })
        .toBuffer({ resolveWithObject: true })
      const trimmedMeta = trimmedResult.info

      if (!originalMeta.width || !originalMeta.height || !trimmedMeta.width || !trimmedMeta.height) {
        throw new Error("metadata incompleta")
      }

      const areaRatio = (trimmedMeta.width * trimmedMeta.height) / (originalMeta.width * originalMeta.height)
      if (areaRatio > 1 - MIN_AREA_REDUCTION) {
        skipped++
        console.log(`= ${p.name} — já bem enquadrada, sem recorte necessário`)
        continue
      }

      const pad = Math.round(Math.max(trimmedMeta.width, trimmedMeta.height) * PADDING_RATIO)
      const outputBuffer = await sharp(inputBuffer)
        .trim({ threshold: TRIM_THRESHOLD })
        .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
      const outputMeta = await sharp(outputBuffer).metadata()

      console.log(
        `~ ${p.name}: ${originalMeta.width}x${originalMeta.height} -> ${outputMeta.width}x${outputMeta.height} ` +
          `(produto ocupava ${(areaRatio * 100).toFixed(1)}% da imagem original)`
      )

      const entry: Record<string, unknown> = {
        id: p.id,
        name: p.name,
        category: p.category,
        old_image_url: p.image_url,
        old_size: `${originalMeta.width}x${originalMeta.height}`,
        new_size: `${outputMeta.width}x${outputMeta.height}`,
      }
      logEntries.push(entry)

      if (args.apply) {
        const filename = `${Date.now()}-${crypto.randomUUID()}.png`
        const { error: uploadError } = await db.storage
          .from(BUCKET)
          .upload(filename, outputBuffer, { contentType: "image/png", upsert: false })
        if (uploadError) throw uploadError

        const { data: publicUrlData } = db.storage.from(BUCKET).getPublicUrl(filename)
        const { error: updateError } = await db
          .from("peripherals")
          .update({ image_url: publicUrlData.publicUrl })
          .eq("id", p.id)
        if (updateError) throw updateError

        entry.new_image_url = publicUrlData.publicUrl
      }

      changed++
    } catch (err) {
      failed++
      console.error(`! ${p.name} (${p.id}): ${err instanceof Error ? err.message : err}`)
    }
  }

  const logPath = path.join(
    process.cwd(),
    `normalize-peripheral-images.${args.apply ? "applied" : "dry-run"}.${Date.now()}.json`
  )
  fs.writeFileSync(logPath, JSON.stringify(logEntries, null, 2))

  console.log(`\n${changed} recortada(s), ${skipped} sem necessidade, ${failed} falharam.`)
  console.log(`Log salvo em ${logPath}`)
  if (!args.apply) {
    console.log("\nDry-run — nada foi salvo. Rode de novo com --apply pra gravar de verdade.")
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
