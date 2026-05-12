import { notFound, redirect } from "next/navigation"

import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { getAuthorizedProfile } from "@/lib/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import EditPostClient from "./EditPostClient"

export default async function EditForumPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_read")) {
    redirect("/admin/forum")
  }

  const supabase = createSupabaseAdminClient()

  const { data: post } = await (supabase
    .from("forum_posts")
    .select("id, slug, title, body, author_name, peripheral_refs, is_hidden, is_locked, is_pinned, vote_score, created_at") as any)
    .eq("slug", slug)
    .maybeSingle()

  if (!post) notFound()

  const refs: string[] = post.peripheral_refs ?? []
  let peripherals: { id: string; name: string; brand: string; category: string }[] = []
  if (refs.length > 0) {
    const { data } = await supabase
      .from("peripherals").select("id, name, brand, category").in("id", refs)
    peripherals = (data ?? []) as typeof peripherals
  }

  return (
    <EditPostClient
      post={{ ...post, peripherals }}
      canWrite={hasAdminPermission(auth.profile, "forum_write")}
    />
  )
}
