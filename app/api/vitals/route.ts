import { NextResponse } from "next/server"
import { z } from "zod"

export const runtime = "nodejs"

/**
 * Recebe os relatórios de INP/LCP ruins do `VitalsReporter` e os escreve no
 * log da função — e só isso: nada de banco, nada de serviço externo. Para
 * achar a interação lenta, filtre os logs por `[vitals]`.
 *
 * Sem autenticação (o visitante anônimo também mede), então o corpo é
 * validado com teto em cada campo: o pior que um abuso consegue é uma linha
 * de log curta. Responde sempre 204 — `sendBeacon` ignora a resposta.
 */

const MAX_BODY_BYTES = 2048

const reportSchema = z.object({
  metric: z.enum(["INP", "LCP"]),
  value: z.number().finite().nonnegative().max(120_000),
  path: z.string().max(200),
  target: z.string().max(200),
  eventType: z.string().max(40).optional(),
  inputDelay: z.number().finite().max(120_000).optional(),
  processing: z.number().finite().max(120_000).optional(),
  presentation: z.number().finite().max(120_000).optional(),
  loadState: z.string().max(20),
})

export async function POST(request: Request) {
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 204 })
    const parsed = reportSchema.safeParse(JSON.parse(text))
    if (parsed.success) {
      const ua = request.headers.get("user-agent") ?? ""
      console.info(
        "[vitals]",
        JSON.stringify({ ...parsed.data, mobile: /Mobi|Android/i.test(ua) })
      )
    }
  } catch {
    // Corpo inválido: ignora em silêncio.
  }
  return new NextResponse(null, { status: 204 })
}
