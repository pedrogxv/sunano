import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Bookmark } from "lucide-react"

import type { PostCardData } from "@/components/forum/PostCard"
import { listSavedPosts } from "@/lib/server/repositories/forum-saved-posts-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { SavedPostsContent } from "./saved-posts-content"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Posts Salvos",
  // Página pessoal (conteúdo varia por conta) — não deve ser indexada.
  robots: { index: false, follow: false },
}

export default async function SavedPostsPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/forum/salvos")
  }

  const { posts, total, totalPages } = await listSavedPosts(user.id, 1)

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-2 py-8 sm:px-4 md:px-6">
      <Link
        href="/forum"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar ao fórum
      </Link>

      <div>
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          <Bookmark className="size-7 text-primary" />
          Posts Salvos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Posts que você guardou no fórum para ler depois.
        </p>
      </div>

      <SavedPostsContent
        initialPosts={posts as PostCardData[]}
        initialTotal={total}
        initialTotalPages={totalPages}
        currentUserId={user.id}
      />
    </div>
  )
}
