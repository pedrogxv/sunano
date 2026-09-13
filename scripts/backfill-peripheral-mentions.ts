import fs from "node:fs"
import path from "node:path"

import { createClient } from "@supabase/supabase-js"

import type { Database } from "../lib/database.types"
import { buildMentionIndex, detectPeripherals } from "../lib/peripheral-mentions"

/**
 * Backfill do vínculo `forum_post_peripherals` no acervo que já existia antes
 * da detecção automática.
 *
 * Posts novos ganham o vínculo ao publicar (rota /api/forum/posts), mas os
 * tópicos antigos ficariam para sempre sem card na sidebar e sem aparecer nas
 * "Discussões no fórum" da ficha do periférico. Este script roda uma vez.
 *
 * Só grava match forte — o mesmo critério da rota. O detector descarta
 * sozinho o que é ambíguo (`rs6 ultra` é teclado ATK *e* mouse Attack Shark)
 * e o que é genérico demais (`deathadder` sem a marca por perto), então um
 * número baixo de vínculos é o comportamento correto, não uma falha: o texto
 * precisa citar o modelo de forma identificável.
 *
 * Não sobrescreve vínculo existente: um post já processado pela rota (ou que
 * o autor ajustou à mão) é pulado, para o backfill não desfazer curadoria.
 *
 * Uso:
 *   npx tsx scripts/backfill-peripheral-mentions.ts           # dry-run + relatório
 *   npx tsx scripts/backfill-peripheral-mentions.ts --apply   # grava de verdade
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

async function main() {
  const apply = process.argv.slice(2).includes("--apply")

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

  console.log(
    apply
      ? "MODO: aplicando vínculos de verdade\n"
      : "MODO: dry-run — nada será salvo (use --apply pra gravar)\n"
  )

  // Catálogo para montar o índice.
  const { data: peripheralRows, error: peripheralError } = await db
    .from("peripherals")
    .select("id, name, category, brands(name)")

  if (peripheralError || !peripheralRows) {
    console.error("Erro ao carregar periféricos:", peripheralError)
    process.exit(1)
  }

  const candidates = peripheralRows.map((row) => {
    const raw = row as unknown as {
      id: string
      name: string
      category: string
      brands: { name: string } | { name: string }[] | null
    }
    const brandRow = Array.isArray(raw.brands) ? raw.brands[0] : raw.brands
    return { id: raw.id, name: raw.name, brand: brandRow?.name ?? "", category: raw.category }
  })

  const byId = new Map(candidates.map((c) => [c.id, c]))
  const index = buildMentionIndex(candidates)
  console.log(`Catálogo: ${candidates.length} periféricos, ${index.phrases.length} frases no índice.\n`)

  const { data: posts, error: postsError } = await db
    .from("forum_posts")
    .select("id, slug, title, body")
    .eq("is_hidden", false)

  if (postsError || !posts) {
    console.error("Erro ao carregar posts:", postsError)
    process.exit(1)
  }

  // Posts que já têm vínculo — não são tocados.
  const { data: existingRows } = await db.from("forum_post_peripherals").select("post_id")
  const alreadyLinked = new Set((existingRows ?? []).map((row) => row.post_id as string))

  let scanned = 0
  let skipped = 0
  let postsWithMatch = 0
  let totalLinks = 0
  const toInsert: Array<{ post_id: string; peripheral_id: string; source: "backfill" }> = []

  for (const post of posts) {
    scanned++
    if (alreadyLinked.has(post.id)) {
      skipped++
      continue
    }

    const matches = detectPeripherals(`${post.title}\n${post.body ?? ""}`, index)
    if (matches.length === 0) continue

    postsWithMatch++
    totalLinks += matches.length
    console.log(`/forum/${post.slug}`)
    console.log(`  "${post.title.slice(0, 70)}"`)
    for (const match of matches) {
      const peripheral = byId.get(match.peripheralId)
      console.log(`    -> ${peripheral?.brand} ${peripheral?.name} [${peripheral?.category}]  (casou: "${match.phrase}")`)
      toInsert.push({ post_id: post.id, peripheral_id: match.peripheralId, source: "backfill" })
    }
    console.log("")
  }

  console.log("─".repeat(60))
  console.log(`Posts analisados:        ${scanned}`)
  console.log(`Pulados (já vinculados): ${skipped}`)
  console.log(`Posts com match:         ${postsWithMatch}`)
  console.log(`Vínculos a gravar:       ${totalLinks}`)

  if (!apply) {
    console.log("\nDry-run: nada foi salvo. Rode com --apply para gravar.")
    return
  }

  if (toInsert.length === 0) {
    console.log("\nNada a gravar.")
    return
  }

  const { error: insertError } = await db.from("forum_post_peripherals").insert(toInsert)
  if (insertError) {
    console.error("\nErro ao gravar vínculos:", insertError)
    process.exit(1)
  }
  console.log(`\n${toInsert.length} vínculos gravados.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
