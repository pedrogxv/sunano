import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { getSunanoReview, upsertSunanoReview } from "@/lib/server/repositories/store-reviews-repository"
import { isValidYoutubeUrl } from "@/lib/youtube-url"

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { id } = await context.params
  const review = await getSunanoReview(id, true)
  return NextResponse.json({ review })
}

const putSchema = z.object({
  rating: z.number().int().min(1).max(5).optional().nullable(),
  title: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(8000),
  video_url: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidYoutubeUrl(v), "URL de vídeo precisa ser um link do YouTube.")
    .optional()
    .nullable(),
  published: z.boolean().optional().default(false),
})

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { id } = await context.params
  const parsed = putSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  try {
    const review = await upsertSunanoReview({
      productId: id,
      adminId: auth.profile.id,
      rating: parsed.data.rating ?? null,
      title: parsed.data.title,
      body: parsed.data.body,
      videoUrl: parsed.data.video_url || null,
      published: parsed.data.published,
    })
    return NextResponse.json({ review })
  } catch {
    return NextResponse.json({ error: "Erro ao salvar a análise do Sunano." }, { status: 500 })
  }
}
