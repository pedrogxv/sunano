import { NextRequest, NextResponse } from "next/server"

import { sendPendingRestockEmails } from "@/lib/server/repositories/restock-emails-repository"
import { isAuthorizedCronRequest } from "@/lib/server/secret-compare"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

// E-mail do "Avise-me quando voltar" (migration 20261223000001). A
// notificação do site sai na hora, por trigger; o e-mail sai aqui, com teto
// diário para não comer a cota do Resend dos e-mails de pedido. Mesmo padrão
// de /api/cron/sale-windows (Bearer CRON_SECRET, fail closed).
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await sendPendingRestockEmails()
  return NextResponse.json({ ok: true, ...result })
}
