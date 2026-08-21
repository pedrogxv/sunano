import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database.types"

/**
 * Cliente Supabase do NAVEGADOR — uso EXCLUSIVO para subir bytes direto pro
 * Storage via signed upload URL (`uploadToSignedUrl`).
 *
 * Sem sessão (`persistSession: false`): quem autoriza o upload é o token de
 * uso único retornado pelo endpoint `/api` que gerou a signed URL, não a
 * conta logada neste client — por isso ele não precisa (e não deve) ler
 * cookies de auth. Continua valendo a regra de ouro do projeto: dado de
 * negócio (tabelas) sempre por `/api`, nunca lido/escrito direto daqui.
 *
 * Existe pra contornar o corpo de requisição da Vercel, hard-capado em
 * ~4.5MB nas serverless functions — arquivos maiores (GIF animado, por
 * exemplo) vão direto pro Storage do Supabase, sem passar pelo Route
 * Handler do Next.js.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

export const supabaseStorageClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})
