import { Flag, FolderTree } from "lucide-react"
import Link from "next/link"

import { countPendingForumReports, listForumPostsForModeration } from "@/lib/server/repositories/forum-repository"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ForumModerationClient } from "./ForumModerationClient"

const PAGE_SIZE = 20

export default async function AdminForumPage() {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_read")) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Sem permissão para acessar o fórum.
      </div>
    )
  }

  const canWrite = hasAdminPermission(auth.profile, "forum_write")

  const [initialData, pendingReports] = await Promise.all([
    listForumPostsForModeration({ filter: "all", q: "", page: 1, pageSize: PAGE_SIZE }),
    countPendingForumReports(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Moderação do Fórum</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie posts e comentários. Posts ocultos não aparecem para o público.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/admin/forum/denuncias">
            <Button size="sm" variant="outline" className="gap-2 border-border text-xs">
              <Flag className="size-3.5" />
              Denúncias
              {pendingReports > 0 && (
                <Badge variant="secondary" className="bg-amber-500/15 text-[10px] text-amber-400">
                  {pendingReports}
                </Badge>
              )}
            </Button>
          </Link>
          <Link href="/admin/forum/categories">
            <Button size="sm" variant="outline" className="gap-2 border-border text-xs">
              <FolderTree className="size-3.5" />
              Categorias
            </Button>
          </Link>
        </div>
      </div>

      <ForumModerationClient
        canWrite={canWrite}
        pageSize={PAGE_SIZE}
        initialPosts={initialData.posts}
        initialCommentsByPost={initialData.commentsByPost}
        initialTotal={initialData.total}
      />
    </div>
  )
}
