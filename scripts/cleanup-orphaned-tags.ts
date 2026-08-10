import fs from "node:fs"
import path from "node:path"

import { createClient } from "@supabase/supabase-js"

import type { Database } from "../lib/database.types"
import { ALL_CATEGORIES, getValidTagKeysForCategory, sanitizeTagsForCategory, type Category } from "../lib/tag-options"

/**
 * `peripherals.tags` é um array de texto sem CHECK constraint no banco — a
 * lista de tags válidas por categoria vive só em lib/tag-options.ts. Quando
 * uma tag é removida de lá (ex.: a limpeza do Headset, que passou de ~19
 * tags genéricas pra só "wired"/"wireless"), itens que já tinham essa tag
 * salva continuam com ela pra sempre: o formulário de admin só renderiza
 * checkbox pras tags que ainda existem na config, então a tag órfã nunca
 * aparece pra ser desmarcada manualmente (ver PeripheralForm, useEffect de
 * autolimpeza). Esse script varre o banco uma vez e corrige essas tags órfãs
 * de todo item existente, pra não depender de alguém reabrir cada item no
 * admin pra "ativar" a autolimpeza.
 *
 * Usa sanitizeTagsForCategory (mesma função do form de admin e das rotas de
 * API): se sobra pelo menos uma tag válida, mantém só essas; se TODAS as tags
 * do item eram órfãs, cai pra primeira tag válida da categoria atual em vez
 * de zerar — o campo é obrigatório, então "remover e pronto" deixa o item
 * sem tag (foi o que aconteceu com o Mchose V9 Pro na 1ª rodada, categoria
 * headset, que ficou com tags: [] depois da limpeza aplicada só a
 * headset/monitors). Um item que já estava com tags: [] antes da limpeza
 * continua assim — este script só substitui valor órfão, não inventa tag em
 * item que nunca teve nenhuma.
 *
 * Uso:
 *   npx tsx scripts/cleanup-orphaned-tags.ts                       # dry-run, todas as categorias
 *   npx tsx scripts/cleanup-orphaned-tags.ts --category=headset    # dry-run, só uma categoria
 *   npx tsx scripts/cleanup-orphaned-tags.ts --apply                # grava de verdade
 */

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
  const categoryArg = argv.find((a) => a.startsWith("--category="))
  return {
    apply: argv.includes("--apply"),
    categories: categoryArg
      ? (categoryArg.split("=")[1].split(",").map((s) => s.trim()) as Category[])
      : ALL_CATEGORIES,
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
  console.log(`Categorias avaliadas: ${args.categories.join(", ")}\n`)

  const { data: peripherals, error } = await db
    .from("peripherals")
    .select("id,name,category,tags")
    .in("category", args.categories)
    .order("category", { ascending: true })
  if (error) throw error

  const rows = peripherals ?? []
  console.log(`${rows.length} periférico(s) avaliado(s).\n`)

  const logEntries: Array<Record<string, unknown>> = []
  let changed = 0

  for (const p of rows) {
    const validKeys = getValidTagKeysForCategory(p.category as Category)
    const currentTags = p.tags ?? []
    const orphanedTags = currentTags.filter((tag) => !validKeys.includes(tag as (typeof validKeys)[number]))

    if (orphanedTags.length === 0) continue

    const newTags = sanitizeTagsForCategory(p.category as Category, currentTags)
    const fallbackApplied = currentTags.length > 0 && newTags.length > 0 && newTags.every((tag) => orphanedTags.includes(tag))

    console.log(
      `~ [${p.category}] ${p.name}: removendo ${orphanedTags.join(", ")} (fica com: ${newTags.join(", ") || "nenhuma"}` +
        `${fallbackApplied ? " — fallback, todas as tags eram órfãs" : ""})`
    )
    logEntries.push({
      id: p.id,
      name: p.name,
      category: p.category,
      old_tags: currentTags,
      new_tags: newTags,
      removed_tags: orphanedTags,
      fallback_applied: fallbackApplied,
    })
    changed++

    if (args.apply) {
      const { error: updateError } = await db
        .from("peripherals")
        .update({ tags: newTags })
        .eq("id", p.id)
      if (updateError) throw updateError
    }
  }

  const logPath = path.join(
    process.cwd(),
    `cleanup-orphaned-tags.${args.apply ? "applied" : "dry-run"}.${Date.now()}.json`
  )
  fs.writeFileSync(logPath, JSON.stringify(logEntries, null, 2))

  console.log(`\n${changed} periférico(s) com tags órfãs${args.apply ? " limpo(s)" : " encontrado(s)"}.`)
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
