import { NextRequest, NextResponse } from "next/server"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { countOrdersByStatus, listOrdersForAdmin, type OrderStatus } from "@/lib/server/repositories/orders-repository"

const VALID_STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "awaiting_shipping_info",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "expired",
]

export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const url = new URL(request.url)
  const statusParam = url.searchParams.get("status")
  const status = statusParam && VALID_STATUSES.includes(statusParam as OrderStatus)
    ? (statusParam as OrderStatus)
    : undefined
  const productId = url.searchParams.get("productId") ?? undefined
  const userQuery = url.searchParams.get("q") ?? undefined
  const userId = url.searchParams.get("userId") ?? undefined
  const dateFrom = url.searchParams.get("dateFrom") ?? undefined
  const dateTo = url.searchParams.get("dateTo") ?? undefined
  const page = Number(url.searchParams.get("page") ?? "1") || 1
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20") || 20

  const [{ orders, total }, counts] = await Promise.all([
    listOrdersForAdmin({ status, productId, userQuery, userId, dateFrom, dateTo, page, pageSize }),
    countOrdersByStatus(),
  ])
  return NextResponse.json({ ok: true, orders, total, page, pageSize, counts })
}
