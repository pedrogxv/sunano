/**
 * Confere que todo objeto do Storage decodifica como imagem válida.
 *
 * Rede de segurança para qualquer script que reescreva arquivos no bucket —
 * `compress-storage-images.ts` e `fix-storage-cache-control.ts` sobrescrevem
 * com `upsert`, o que é irreversível. Um arquivo corrompido por lá não daria
 * erro nenhum: só apareceria como imagem quebrada no site, dias depois.
 *
 * Somente leitura: baixa cada objeto e tenta decodificar com `sharp`. Não
 * grava nada, então pode rodar a qualquer momento.
 *
 * Uso:
 *   npx tsx scripts/verify-storage-images.ts
 */
import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"
import sharp from "sharp"

function envVal(key: string): string {
  const p = path.join(process.cwd(), ".env.local")
  const line = fs.readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`))
  return line ? line.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, "") : ""
}
const db = createClient(envVal("NEXT_PUBLIC_SUPABASE_URL"), envVal("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const BUCKETS = ["peripherals", "images", "store-banners", "comments", "support"]

async function listAll(bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = []
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.storage.from(bucket).list(prefix, {
      limit: 100, offset, sortBy: { column: "name", order: "asc" },
    })
    if (error) throw error
    const page = data ?? []
    for (const o of page) {
      const full = prefix ? `${prefix}/${o.name}` : o.name
      if (!(o as any).metadata?.size) out.push(...(await listAll(bucket, full)))
      else out.push(full)
    }
    if (page.length < 100) break
  }
  return out
}

async function main() {
  let ok = 0, bad = 0
  for (const bucket of BUCKETS) {
    let names: string[]
    try { names = await listAll(bucket) } catch { continue }
    for (const name of names) {
      const { data, error } = await db.storage.from(bucket).download(name)
      if (error || !data) { bad++; console.error(`! DOWNLOAD ${bucket}/${name}`); continue }
      try {
        const m = await sharp(Buffer.from(await data.arrayBuffer())).metadata()
        if (!m.width || !m.height) throw new Error("sem dimensoes")
        ok++
      } catch (e) {
        bad++
        console.error(`! CORROMPIDA ${bucket}/${name}: ${(e as Error).message}`)
      }
    }
    console.log(`${bucket}: verificado`)
  }
  console.log(`\nVERIFICACAO: ${ok} ok, ${bad} com problema`)
}
main().catch((e) => { console.error(e); process.exit(1) })
