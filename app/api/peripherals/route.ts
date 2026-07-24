import { NextRequest, NextResponse } from "next/server"

import { queryPeripherals } from "@/lib/server/repositories/peripherals-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Endpoint público de periféricos (busca, comparador, autocomplete).
 *
 * Aceita: `search`, `ids`, `exclude`, `category`, `limit`, `full`.
 * A consulta vive no `peripherals-repository`.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseLimit(value: string | null): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 200
}

function parseIdList(value: string | null): string[] | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const list = trimmed
    .split(",")
    .map((id) => id.trim())
    .filter((id) => UUID_RE.test(id))
  return list.length > 0 ? list : undefined
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get("category")?.trim() || undefined

  try {
    const peripherals = await queryPeripherals({
      search: searchParams.get("search")?.trim() ?? "",
      ids: parseIdList(searchParams.get("ids")),
      excludeIds: parseIdList(searchParams.get("exclude")),
      category,
      limit: parseLimit(searchParams.get("limit")),
      full: searchParams.get("full") === "1",
    })
    return NextResponse.json({ peripherals })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar periféricos."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
