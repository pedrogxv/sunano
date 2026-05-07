import { createClient } from "@supabase/supabase-js"
import fs from "fs"
import path from "path"

async function runMigration() {
  try {
    console.log("🔄 Iniciando migração de tiers...")

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não estão definidas. " +
        "Configure-as em seu ambiente ou execute a migração no Supabase SQL Editor."
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const sqlFile = path.join(process.cwd(), "supabase/migrations/20260507_migrate_tiers.sql")
    const sql = fs.readFileSync(sqlFile, "utf-8")

    console.log("⚙️  Executando migração via RPC (se disponível)...")
    
    // Since Supabase doesn't expose raw SQL execution, we need to use the SQL Editor manually
    // or use a trusted function if available
    console.log("⚠️  Note: Execute a migração manualmente no Supabase SQL Editor:")
    console.log("   1. Abra https://supabase.com/dashboard")
    console.log("   2. Vá para SQL Editor")
    console.log("   3. Cole o SQL abaixo e execute:")
    console.log("\n" + "=".repeat(80))
    console.log(sql)
    console.log("=".repeat(80))
    
    process.exit(0)
  } catch (err) {
    console.error("❌ Erro:", err)
    process.exit(1)
  }
}

runMigration()

