import { redirect } from "next/navigation"

import { hasAdminPermission, isWebMaster } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { listBrands } from "@/lib/server/repositories/brands-repository"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { BrandsClient } from "./BrandsClient"

export default async function AdminBrandsPage() {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "brands_read")) {
    redirect("/admin")
  }

  const brands = await listBrands()

  return (
    <div className="space-y-6">
      <BackBreadcrumb href="/admin" parentLabel="Dashboard" currentLabel="Marcas" />
      <BrandsClient
        initialBrands={brands}
        canWrite={hasAdminPermission(auth.profile, "brands_write")}
        canDelete={isWebMaster(auth.profile)}
      />
    </div>
  )
}
