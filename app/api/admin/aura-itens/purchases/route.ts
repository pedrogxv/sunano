import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { listAuraPurchases } from "@/lib/server/repositories/aura-store-repository"
import { searchUserProfiles } from "@/lib/server/repositories/users-repository"

/**
 * Histórico de compras da Central de Aura, paginado por keyset. Filtros
 * opcionais por item, comprador e tipo. `?users=<termo>` é um atalho para o
 * autocomplete do filtro de usuário (reusa a busca por nome já existente),
 * retornado no mesmo endpoint para não multiplicar rotas.
 *
 * Permissão: `events_read` — a mesma que já governa gerenciar os itens da
 * loja de Aura. Web Master sempre passa (matriz de cargos em
 * `lib/admin-permissions.ts`).
 */
const querySchema = z.object({
  itemId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  kind: z.enum(["avatar_frame", "vip_month", "display_name_change", "streak_shield"]).optional(),
  cursor: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  users: z.string().trim().min(2).max(60).optional(),
})

export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "events_read")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Parâmetros inválidos." },
      { status: 400 }
    )
  }

  // Atalho: autocomplete do filtro de usuário.
  if (parsed.data.users) {
    const results = await searchUserProfiles(parsed.data.users, 8)
    return NextResponse.json({
      users: results.map((u) => ({
        id: u.id,
        displayName: u.display_name?.trim() || `Membro ${u.id.slice(0, 6)}`,
        displaySlug: u.display_slug,
        avatarUrl: u.avatar_url,
      })),
    })
  }

  const result = await listAuraPurchases({
    itemId: parsed.data.itemId ?? null,
    userId: parsed.data.userId ?? null,
    kind: parsed.data.kind ?? null,
    cursor: parsed.data.cursor ?? null,
    limit: parsed.data.limit,
  })

  return NextResponse.json(result)
}
