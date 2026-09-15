import { redirect } from "next/navigation"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { listSoftwaresForAdmin } from "@/lib/server/repositories/softwares-repository"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { SoftwaresClient } from "./SoftwaresClient"

export default async function AdminSoftwaresPage() {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "brands_read")) {
    redirect("/admin")
  }

  const softwares = await listSoftwaresForAdmin()

  return (
    <div className="space-y-6">
      <BackBreadcrumb href="/admin" parentLabel="Dashboard" currentLabel="Softwares" />
      <SoftwaresClient
        initialSoftwares={softwares}
        canWrite={hasAdminPermission(auth.profile, "brands_write")}
      />
    </div>
  )
}
