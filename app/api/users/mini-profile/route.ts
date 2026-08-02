import { NextResponse } from "next/server"

import { getMiniProfileBySlug } from "@/lib/server/repositories/users-repository"

/**
 * Dados do cartão de preview rápido ("Mini Perfil"), buscados sob demanda
 * quando o cursor para sobre um avatar/autor.
 *
 * Carregar no hover — e não junto da listagem — mantém `/pessoas` e o fórum
 * com a mesma consulta de hoje: nenhuma tela precisa passar a trazer
 * `mini_banner_url`, bio e contadores só porque o cartão pode aparecer.
 */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug")?.trim()
  if (!slug) {
    return NextResponse.json({ error: "Perfil não informado." }, { status: 400 })
  }

  const profile = await getMiniProfileBySlug(slug)
  if (!profile) {
    return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 })
  }

  // Conteúdo público e pouco volátil: um cache curto absorve o vaivém do
  // cursor sobre a mesma grade sem servir números velhos.
  return NextResponse.json(
    { profile },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  )
}
