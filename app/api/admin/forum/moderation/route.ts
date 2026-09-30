import { NextResponse } from "next/server"
import * as z from "zod"

import { hasAdminPermission } from "@/lib/admin-permissions"
import {
  deleteForumPost,
  getForumModerationTarget,
  listForumPostsForModeration,
  logForumModeration,
  setForumCommentHidden,
  setForumPostFlag,
  type ModerationFilter,
} from "@/lib/server/repositories/forum-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

const FILTERS: ModerationFilter[] = ["all", "visible", "hidden", "locked", "pinned"]
const PAGE_SIZE = 20

async function requireProfile() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) return null

  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("id, role, permissions")
    .eq("id", authData.user.id)
    .maybeSingle()

  return profile
}

/** Lista posts/comentários para a tela de moderação — usado pela busca sem reload. */
export async function GET(request: Request) {
  const profile = await requireProfile()
  if (!profile || !hasAdminPermission(profile, "forum_read")) {
    return NextResponse.json({ error: "Sem permissão para acessar o fórum." }, { status: 403 })
  }

  const url = new URL(request.url)
  const filterParam = url.searchParams.get("filter") ?? "all"
  const filter = (FILTERS.includes(filterParam as ModerationFilter) ? filterParam : "all") as ModerationFilter
  const q = url.searchParams.get("q")?.trim() ?? ""
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1)

  const result = await listForumPostsForModeration({ filter, q, page, pageSize: PAGE_SIZE })

  return NextResponse.json({
    posts: result.posts,
    commentsByPost: result.commentsByPost,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / PAGE_SIZE)),
    page,
  })
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("post_flag"),
    postId: z.string().uuid(),
    flag: z.enum(["is_hidden", "is_locked", "is_pinned"]),
    value: z.boolean(),
  }),
  z.object({
    type: z.literal("comment_hidden"),
    commentId: z.string().uuid(),
    value: z.boolean(),
  }),
  z.object({
    type: z.literal("delete_post"),
    postId: z.string().uuid(),
  }),
])

/** Nome da ação no `audit_log` para [ligar, desligar] cada flag. */
const POST_FLAG_ACTIONS = {
  is_hidden: ["forum_post_hidden", "forum_post_unhidden"],
  is_locked: ["forum_post_locked", "forum_post_unlocked"],
  is_pinned: ["forum_post_pinned", "forum_post_unpinned"],
} as const

/** Aplica uma ação de moderação (toggle de flag ou exclusão) sem recarregar a página. */
export async function POST(request: Request) {
  const profile = await requireProfile()
  if (!profile || !hasAdminPermission(profile, "forum_write")) {
    return NextResponse.json({ error: "Sem permissão para moderar o fórum." }, { status: 403 })
  }

  const json = await request.json().catch(() => null)
  const parsed = actionSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 })
  }

  const action = parsed.data
  const target = await getForumModerationTarget(
    action.type === "comment_hidden" ? { commentId: action.commentId } : { postId: action.postId }
  )

  if (action.type === "post_flag") {
    await setForumPostFlag(action.postId, action.flag, action.value)
    await logForumModeration(profile.id, POST_FLAG_ACTIONS[action.flag][action.value ? 0 : 1], target)
  } else if (action.type === "comment_hidden") {
    await setForumCommentHidden(action.commentId, action.value)
    await logForumModeration(profile.id, action.value ? "forum_comment_hidden" : "forum_comment_unhidden", target)
  } else {
    const result = await deleteForumPost(action.postId)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    await logForumModeration(profile.id, "forum_post_deleted", target)
  }

  return NextResponse.json({ ok: true })
}
