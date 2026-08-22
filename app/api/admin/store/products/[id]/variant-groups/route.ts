import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { replaceProductVariantGroups } from "@/lib/server/repositories/store-repository"

const MIN_PRICE_CENTS = 600
const MAX_GROUPS = 6
const MAX_OPTIONS_PER_GROUP = 12

const groupsSchema = z.object({
  groups: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(60),
        options: z
          .array(
            z.object({
              id: z.string().uuid().optional(),
              label: z.string().trim().min(1).max(60),
              price_cents_override: z.number().int().min(MIN_PRICE_CENTS, "Preço mínimo de R$6,00.").nullable().optional(),
              is_sold_out: z.boolean().optional().default(false),
            })
          )
          .min(1, "Cada grupo precisa de pelo menos uma opção.")
          .max(MAX_OPTIONS_PER_GROUP, `Cada grupo pode ter no máximo ${MAX_OPTIONS_PER_GROUP} opções.`),
      })
    )
    .max(MAX_GROUPS, `Cada produto pode ter no máximo ${MAX_GROUPS} grupos de variantes.`),
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
  const parsed = groupsSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  try {
    const groups = await replaceProductVariantGroups(
      id,
      parsed.data.groups.map((g) => ({
        id: g.id,
        name: g.name,
        options: g.options.map((o) => ({
          id: o.id,
          label: o.label,
          price_cents_override: o.price_cents_override ?? null,
          is_sold_out: o.is_sold_out ?? false,
        })),
      }))
    )
    return NextResponse.json({ ok: true, groups })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao salvar variantes."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
