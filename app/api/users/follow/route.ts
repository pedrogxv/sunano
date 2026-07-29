import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import {
  countFollowers,
  followUser,
  isFollowing,
  unfollowUser,
} from "@/lib/server/repositories/users-repository"

export const dynamic = "force-dynamic"

const bodySchema = z.object({ userId: z.string().uuid("Perfil inválido.") })

async function resolveTarget(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return { error: NextResponse.json({ error: "Entre para seguir perfis." }, { status: 401 }) }
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return { error: NextResponse.json({ error: "Perfil inválido." }, { status: 400 }) }
  }

  if (parsed.data.userId === user.id) {
    return { error: NextResponse.json({ error: "Você não pode seguir a si mesmo." }, { status: 400 }) }
  }

  return { userId: user.id, targetId: parsed.data.userId }
}

/** Passa a seguir um perfil. */
export async function POST(request: NextRequest) {
  const resolved = await resolveTarget(request)
  if ("error" in resolved) return resolved.error

  try {
    await followUser(resolved.userId, resolved.targetId)
    const followers = await countFollowers(resolved.targetId)
    return NextResponse.json({ ok: true, following: true, followers })
  } catch {
    return NextResponse.json({ error: "Erro ao seguir o perfil." }, { status: 500 })
  }
}

/** Deixa de seguir um perfil. */
export async function DELETE(request: NextRequest) {
  const resolved = await resolveTarget(request)
  if ("error" in resolved) return resolved.error

  try {
    await unfollowUser(resolved.userId, resolved.targetId)
    const followers = await countFollowers(resolved.targetId)
    return NextResponse.json({ ok: true, following: false, followers })
  } catch {
    return NextResponse.json({ error: "Erro ao deixar de seguir." }, { status: 500 })
  }
}

/** Estado atual (`?userId=`): se o usuário logado segue e o total de seguidores. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const targetId = searchParams.get("userId")
  if (!targetId) {
    return NextResponse.json({ error: "Perfil inválido." }, { status: 400 })
  }

  const user = await getRequestUser(request)
  const [followers, following] = await Promise.all([
    countFollowers(targetId),
    user ? isFollowing(user.id, targetId) : Promise.resolve(false),
  ])

  return NextResponse.json({ ok: true, following, followers, authenticated: Boolean(user) })
}
