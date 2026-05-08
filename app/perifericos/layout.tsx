import { AdminShell } from "@/components/layout/AdminShell"
import { PublicSidebar } from "@/components/layout/PublicSidebar"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export default async function PerifericosLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user

  let isAdmin = false

  if (user) {
    const { data: profile } = await supabase
      .from("admin_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle()

    isAdmin = Boolean(profile)
  }

  if (isAdmin) {
    return <AdminShell>{children}</AdminShell>
  }

  return (
    <div className="min-h-screen bg-background text-foreground ">
      <div className="flex">
        <div className="hidden md:flex md:sticky  md:h-[calc(100vh-64px)] md:shrink-0">
          <PublicSidebar />
        </div>

        <main className="flex-1 min-w-0">{children}</main>
      </div>

      <div className="md:hidden">
        <PublicSidebar />
      </div>
    </div>
  )
}
