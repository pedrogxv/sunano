import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { createClient } from "@supabase/supabase-js"

/**
 * Remove do Storage os arquivos que nenhuma linha do banco referencia.
 *
 * De onde vem o lixo: trocar avatar, banner ou capa sempre grava um path novo
 * (o nome carrega timestamp), e nada apaga o anterior — a coluna passa a
 * apontar pro arquivo novo e o antigo fica pagando armazenamento pra sempre.
 * O mesmo vale pra imagem que o admin sobe e depois remove do formulário, e
 * pro upload de perfil cuja etapa de confirmação falhou no meio.
 *
 * Como decide o que é órfão: em vez de listar as colunas de imagem à mão — o
 * caminho fácil de errar, porque URL de imagem também aparece no markdown de
 * post do fórum, no jsonb de galeria e no snapshot de itens do pedido — este
 * script varre TODAS as tabelas expostas pelo PostgREST, serializa cada linha
 * inteira e considera referenciado qualquer arquivo cujo nome apareça nesse
 * texto. Um arquivo só é apagado se não aparecer em lugar nenhum.
 *
 * A varredura é refeita na hora da exclusão, nunca reaproveitada de uma
 * execução anterior: entre o dry-run e o `--apply` alguém pode ter subido uma
 * imagem nova, e apagar por causa de uma lista velha seria perda de dado real.
 *
 * Uso:
 *   npx tsx scripts/cleanup-orphaned-storage.ts              # dry-run
 *   npx tsx scripts/cleanup-orphaned-storage.ts --apply      # apaga
 *   npx tsx scripts/cleanup-orphaned-storage.ts --min-age-days=30
 */

const BUCKETS = ["peripherals", "images", "store-banners", "comments", "support"] as const

/**
 * Um upload recém-criado pode ainda não ter sido salvo no banco: o usuário
 * está com o formulário aberto, ou o passo de confirmação está em andamento.
 * Apagar nessa janela quebraria um envio legítimo em curso, então o padrão
 * protege qualquer coisa criada nos últimos dias.
 */
const DEFAULT_MIN_AGE_DAYS = 7

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
  const minAge = get("--min-age-days")
  return {
    apply: argv.includes("--apply"),
    bucket: bucket && BUCKETS.includes(bucket as (typeof BUCKETS)[number]) ? bucket : null,
    minAgeDays: minAge ? Number(minAge) : DEFAULT_MIN_AGE_DAYS,
  }
}

type StorageObject = { name: string; size: number; createdAt: string }

/** Só o que este script usa do client — evita amarrar na assinatura genérica do SDK. */
type StorageClient = {
  storage: {
    from: (bucket: string) => {
      list: (
        prefix: string,
        options: { limit: number; offset: number; sortBy: { column: string; order: string } }
      ) => Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>
    }
  }
}

/** O `list` do Storage devolve no máximo 100 itens por página. */
async function listAllObjects(db: StorageClient, bucket: string): Promise<StorageObject[]> {
  const out: StorageObject[] = []
  const pageSize = 100
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.storage
      .from(bucket)
      .list("", { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } })
    if (error) throw error
    const page = data ?? []
    for (const obj of page) {
      const meta = (obj as { metadata?: { size?: number } }).metadata
      // Entrada sem metadata é "pasta" (prefixo), não arquivo.
      if (!meta?.size) continue
      out.push({
        name: obj.name,
        size: meta.size,
        createdAt: (obj as { created_at?: string }).created_at ?? "",
      })
    }
    if (page.length < pageSize) break
  }
  return out
}

/**
 * Texto de todas as linhas de todas as tabelas, concatenado.
 *
 * Serializar a linha inteira (em vez de escolher colunas) é o que faz a
 * checagem valer pra URL escondida em markdown, jsonb ou array — que é
 * exatamente onde ela costuma estar.
 */
async function dumpDatabaseText(supabaseUrl: string, serviceRoleKey: string): Promise<string> {
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }

  const schemaRes = await fetch(`${supabaseUrl}/rest/v1/`, { headers })
  if (!schemaRes.ok) throw new Error(`não foi possível ler o schema (${schemaRes.status})`)
  const schema = (await schemaRes.json()) as { definitions?: Record<string, unknown> }
  const tables = Object.keys(schema.definitions ?? {})
  if (tables.length === 0) throw new Error("schema veio sem tabelas — abortando por segurança")

  const chunks: string[] = []
  let scanned = 0
  for (const table of tables) {
    for (let offset = 0; ; offset += 1000) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/${table}?select=*&limit=1000&offset=${offset}`,
        { headers }
      )
      // View sem permissão ou relação especial: ignora, mas nunca em silêncio.
      if (!res.ok) {
        if (offset === 0) console.warn(`  ! ${table}: ignorada (HTTP ${res.status})`)
        break
      }
      const rows = (await res.json()) as unknown[]
      if (!Array.isArray(rows) || rows.length === 0) break
      chunks.push(JSON.stringify(rows))
      if (rows.length < 1000) break
    }
    scanned++
  }
  console.log(`  ${scanned} tabela(s) varrida(s)`)
  return chunks.join("\n")
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
      ? "MODO: aplicando — arquivos órfãos serão APAGADOS (irreversível)\n"
      : "MODO: dry-run — nada será apagado (use --apply pra valer)\n"
  )

  console.log("Lendo referências do banco...")
  const dbText = await dumpDatabaseText(supabaseUrl, serviceRoleKey)

  const cutoff = Date.now() - args.minAgeDays * 86_400_000
  const buckets = args.bucket ? [args.bucket] : [...BUCKETS]
  const logEntries: Array<Record<string, unknown>> = []
  let totalOrphanBytes = 0
  let totalOrphans = 0
  let totalKept = 0
  let totalTooNew = 0
  let failed = 0

  for (const bucket of buckets) {
    let objects: StorageObject[]
    try {
      objects = await listAllObjects(db, bucket)
    } catch (error) {
      console.error(`! bucket ${bucket}: falha ao listar — ${(error as Error).message}`)
      continue
    }

    const orphans: StorageObject[] = []
    let kept = 0
    let tooNew = 0
    for (const obj of objects) {
      if (dbText.includes(obj.name)) {
        kept++
        continue
      }
      if (obj.createdAt && new Date(obj.createdAt).getTime() > cutoff) {
        tooNew++
        continue
      }
      orphans.push(obj)
    }

    const bytes = orphans.reduce((acc, o) => acc + o.size, 0)
    totalOrphanBytes += bytes
    totalOrphans += orphans.length
    totalKept += kept
    totalTooNew += tooNew

    console.log(
      `\n=== ${bucket}: ${objects.length} arquivo(s) — ${kept} em uso, ` +
        `${tooNew} recente(s) preservado(s), ${orphans.length} órfão(s) (${(bytes / 1048576).toFixed(1)}MB)`
    )
    for (const o of orphans) {
      console.log(`- ${o.name} (${(o.size / 1024).toFixed(0)}KB, ${o.createdAt.slice(0, 10)})`)
      logEntries.push({ bucket, name: o.name, size: o.size, createdAt: o.createdAt })
    }

    if (args.apply && orphans.length > 0) {
      // `remove` aceita no máximo algumas centenas de paths por chamada.
      for (let i = 0; i < orphans.length; i += 100) {
        const batch = orphans.slice(i, i + 100).map((o) => o.name)
        const { error } = await db.storage.from(bucket).remove(batch)
        if (error) {
          failed += batch.length
          console.error(`! falha ao apagar lote de ${batch.length}: ${error.message}`)
        }
      }
    }
  }

  console.log("\n──────────────────────────────────────────")
  console.log(
    `em uso: ${totalKept}   recentes preservados: ${totalTooNew}   ` +
      `órfãos: ${totalOrphans} (${(totalOrphanBytes / 1048576).toFixed(1)}MB)`
  )
  if (failed > 0) console.log(`falhas ao apagar: ${failed}`)

  if (logEntries.length > 0) {
    // Fora do repo: o log lista nomes de arquivo do bucket e não deve virar
    // conteúdo versionado (nem confundir uma varredura futura por referências).
    const logPath = path.join(os.tmpdir(), `cleanup-orphans-${Date.now()}.json`)
    fs.writeFileSync(logPath, JSON.stringify(logEntries, null, 2))
    console.log(`log: ${logPath}`)
  }

  if (!args.apply && totalOrphans > 0) {
    console.log("\nNada foi apagado. Rode de novo com --apply para remover.")
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
