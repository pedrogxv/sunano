import { redirect } from "next/navigation"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { listForumCategoriesForAdmin } from "@/lib/server/repositories/forum-categories-repository"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { CategoriesClient } from "./CategoriesClient"

export default async function AdminForumCategoriesPage() {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_read")) {
    redirect("/admin/forum")
  }

  const categories = await listForumCategoriesForAdmin()

  return (
    <div className="space-y-6">
      <BackBreadcrumb href="/admin/forum" parentLabel="Moderação" currentLabel="Categorias" />
      <CategoriesClient
        initialCategories={categories}
        canWrite={hasAdminPermission(auth.profile, "forum_write")}
      />
    </div>
  )
}
