import fs from "node:fs"
import path from "node:path"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "../lib/database.types"
import { checkContent } from "../lib/content-filter"
import { slugifyDisplayName, validateDisplayName } from "../lib/profile-name"

/**
 * Correção retroativa: aplica o filtro de termos ofensivos (lib/content-filter)
 * em nome de exibição e bio de perfis já cadastrados, de antes do filtro
 * existir. Quem violar tem o termo trocado por asteriscos e recebe uma
 * notificação de sistema (sino, ver notification-bell.tsx) avisando o que
 * mudou e por quê.
 *
 * Nome censurado pode colidir com o slug de outro perfil (dois nomes
 * ofensivos diferentes podem virar o mesmo "****"), então resolve unicidade
 * tentando "****", "****2", "****3"... — mesma ideia de
 * `resolveAvailableDisplayName` no repository, reimplementada aqui porque
 * aquele módulo importa `server-only` e não roda fora do Next.js.
 *
 * Uso:
 *   npx tsx scripts/censor-offensive-profiles.ts             # dry-run
 *   npx tsx scripts/censor-offensive-profiles.ts --apply     # grava e notifica
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
  return { apply: argv.includes("--apply") }
}

const NOTICE_TITLE = "Seu perfil foi atualizado"
const NOTICE_LINK = "/conta"
function noticeBody(fields: string[]) {
  return (
    `Identificamos um termo que viola nossos Termos de Uso ${fields.join(" e ")} da sua conta ` +
    `e o substituímos por asteriscos. Acesse sua conta para escolher um novo texto.`
  )
}

/**
 * Primeiro nome livre a partir de `base` — "****", "****2", "****3"...
 * Versão standalone de `resolveAvailableDisplayName` (users-repository.ts),
 * que não pode ser importada aqui por causa do `server-only`.
 */
async function resolveAvailableDisplayName(
  db: SupabaseClient<Database>,
  base: string,
  userId: string
): Promise<string> {
  const cleaned = base.trim().slice(0, 30)
  const fallback = `user-${userId.replace(/-/g, "").slice(0, 8)}`
  const root = slugifyDisplayName(cleaned).length >= 2 ? cleaned : fallback

  const isAvailable = async (candidate: string) => {
    const slug = slugifyDisplayName(candidate)
    if (!slug) return false
    const { data, error } = await db
      .from("user_profiles")
      .select("id")
      .eq("display_slug", slug)
      .neq("id", userId)
      .limit(1)
    if (error) return false
    return (data ?? []).length === 0
  }
  const usable = async (candidate: string) => !validateDisplayName(candidate) && (await isAvailable(candidate))

  if (await usable(root)) return root
  for (let attempt = 2; attempt <= 50; attempt += 1) {
    const candidate = `${root}${attempt}`
    if (await usable(candidate)) return candidate
  }
  // Improvável: 50 variações ocupadas/reservadas. O id não colide com nada.
  return fallback
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

  const { data: profiles, error } = await db
    .from("user_profiles")
    .select("id, display_name, bio")
  if (error) throw error

  const rows = profiles ?? []
  console.log(`${rows.length} perfil(is) para avaliar.\n`)

  const logEntries: Array<Record<string, unknown>> = []
  let changed = 0

  for (const p of rows) {
    const nameCheck = checkContent(p.display_name ?? "")
    const bioCheck = checkContent(p.bio ?? "")
    if (!nameCheck.blocked && !bioCheck.blocked) continue

    const fields: string[] = []
    const update: { display_name?: string; bio?: string } = {}

    if (nameCheck.blocked) {
      // Garante que o nome censurado não colide com o slug de outro perfil —
      // mesma resolução usada em login social / primeiro save de perfil.
      update.display_name = await resolveAvailableDisplayName(db, nameCheck.censored, p.id)
      fields.push("no nome")
    }
    if (bioCheck.blocked) {
      update.bio = bioCheck.censored
      fields.push("na bio")
    }

    console.log(
      `~ ${p.id}: ${nameCheck.blocked ? `nome "${p.display_name}" -> "${update.display_name}"` : ""} ` +
        `${bioCheck.blocked ? `bio "${p.bio}" -> "${update.bio}"` : ""}`
    )

    logEntries.push({
      id: p.id,
      old_display_name: p.display_name,
      new_display_name: update.display_name ?? null,
      old_bio: p.bio,
      new_bio: update.bio ?? null,
    })
    changed++

    if (args.apply) {
      const { error: updateError } = await db.from("user_profiles").update(update).eq("id", p.id)
      if (updateError) {
        console.error(`! falha ao atualizar ${p.id}:`, updateError.message)
        continue
      }

      const { error: notifyError } = await db.rpc("broadcast_system_notification", {
        p_title: NOTICE_TITLE,
        p_body: noticeBody(fields),
        p_link: NOTICE_LINK,
        p_user_id: p.id,
      })
      if (notifyError) {
        console.error(`! falha ao notificar ${p.id}:`, notifyError.message)
      }
    }
  }

  const logPath = path.join(
    process.cwd(),
    `censor-offensive-profiles.${args.apply ? "applied" : "dry-run"}.${Date.now()}.json`
  )
  fs.writeFileSync(logPath, JSON.stringify(logEntries, null, 2))

  console.log(`\n${changed} perfil(is) com termo ofensivo encontrado(s).`)
  console.log(`Log salvo em ${logPath}`)
  if (!args.apply) {
    console.log("\nDry-run — nada foi salvo. Rode de novo com --apply pra gravar e notificar de verdade.")
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
