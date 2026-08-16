"use client"

import Link from "next/link"
import { Bookmark } from "lucide-react"
import { AccountPageHeader } from "@/components/account/AccountPageHeader"
import { ProfileSection } from "@/components/account/ProfileSection"
import BoxLoader from "@/components/ui/box-loader"
import { useOwnProfile } from "@/lib/hooks/use-own-profile"
import { CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import { cn } from "@/lib/utils"

export default function ProfilePage() {
  const { profile, setProfile, loading } = useOwnProfile()

  if (loading || !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <BoxLoader />
      </div>
    )
  }

  return (
    <div className="pb-16">
      <AccountPageHeader profile={profile} />

      <div className="mx-auto max-w-4xl px-2 py-8 sm:px-4 md:px-6">
        <Link
          href="/perfil/listas"
          className={cn(
            "mb-6 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold text-foreground/90 transition-colors",
            CARD_SURFACE_INTERACTIVE
          )}
        >
          <Bookmark className="size-4 text-primary" />
          Minhas listas de compras
        </Link>

        <ProfileSection profile={profile} onProfileChange={setProfile} />
      </div>
    </div>
  )
}
