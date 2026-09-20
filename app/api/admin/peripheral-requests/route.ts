import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import {
  getPeripheralRequestStats,
  listPeripheralRequestsForAdmin,
  type AdminRequestStatusFilter,
} from "@/lib/server/repositories/peripheral-requests-repository"
import { PERIPHERAL_REQUEST_STATUSES } from "@/lib/peripheral-requests"
import { isCategory } from "@/lib/tag-options"

/** Fila de pedidos de cadastro de periférico, para o painel. */
export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "peripherals_read")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const url = new URL(request.url)
  const statusParam = url.searchParams.get("status")
  const status: AdminRequestStatusFilter =
    statusParam === "all" || statusParam === "open"
      ? statusParam
      : PERIPHERAL_REQUEST_STATUSES.find((value) => value === statusParam) ?? "open"
  const categoryParam = url.searchParams.get("category")
  const page = Number(url.searchParams.get("page")) || 1
  const pageSize = Number(url.searchParams.get("pageSize")) || 20

  const [{ requests, total }, stats] = await Promise.all([
    listPeripheralRequestsForAdmin({
      status,
      category: isCategory(categoryParam) ? categoryParam : undefined,
      page,
      pageSize,
    }),
    getPeripheralRequestStats(),
  ])

  return NextResponse.json({ ok: true, requests, total, page, pageSize, stats })
}
