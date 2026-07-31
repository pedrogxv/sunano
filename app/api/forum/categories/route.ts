import { NextResponse } from "next/server"

import { listForumCategoriesPublic } from "@/lib/server/repositories/forum-categories-repository"

export const dynamic = "force-dynamic"

/** Árvore de categorias ativas — usada no formulário de novo post e nos filtros do fórum. */
export async function GET() {
  try {
    const categories = await listForumCategoriesPublic()
    return NextResponse.json({ ok: true, categories })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar categorias." }, { status: 500 })
  }
}
