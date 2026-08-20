import { NextRequest, NextResponse } from "next/server"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import {
  getSupportTicketStats,
  listSupportTicketsForAdmin,
  type SupportTicketStatus,
  type SupportWaitingOn,
} from "@/lib/server/repositories/support-repository"

const VALID_STATUSES: SupportTicketStatus[] = ["open", "resolved", "cancelled"]
const VALID_WAITING: SupportWaitingOn[] = ["user", "admin", "closed"]

export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "support_read")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const url = new URL(request.url)
  const statusParam = url.searchParams.get("status")
  const status = statusParam && VALID_STATUSES.includes(statusParam as SupportTicketStatus)
    ? (statusParam as SupportTicketStatus)
    : "all"
  const waitingParam = url.searchParams.get("waiting")
  const waitingOn = waitingParam && VALID_WAITING.includes(waitingParam as SupportWaitingOn)
    ? (waitingParam as SupportWaitingOn)
    : "all"
  const userId = url.searchParams.get("userId") ?? undefined
  const dateFrom = url.searchParams.get("dateFrom") ?? undefined
  const dateTo = url.searchParams.get("dateTo") ?? undefined
  const page = Number(url.searchParams.get("page") ?? "1") || 1
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20") || 20

  const [{ tickets, total }, stats] = await Promise.all([
    listSupportTicketsForAdmin({
      status,
      waitingOn,
      userId,
      dateFrom,
      dateTo,
      page,
      pageSize,
    }),
    getSupportTicketStats(),
  ])

  return NextResponse.json({ ok: true, tickets, total, page, pageSize, stats })
}
