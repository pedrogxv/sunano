"use client"

import { AccountPageHeader } from "@/components/account/AccountPageHeader"
import { ProfileLoadError } from "@/components/account/ProfileLoadError"
import { ProfileSection } from "@/components/account/ProfileSection"
import BoxLoader from "@/components/ui/box-loader"
import { useOwnProfile } from "@/lib/hooks/use-own-profile"

export default function ProfilePage() {
  const { profile, setProfile, loading, error, reload } = useOwnProfile()

  if (error) return <ProfileLoadError onRetry={reload} />

  if (loading || !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <BoxLoader />
      </div>
    )
  }

  return (
    <div className="pb-16">
      <AccountPageHeader profile={profile} width="max-w-7xl" />

      {/* `max-w-7xl`: o editor virou duas colunas (previews presos de um lado,
          abas do outro) e num `max-w-4xl` as duas ficavam estreitas demais
          para valer — a coluna de controles não comportava dois campos lado a
          lado, que é o que tirava a tela da rolagem infinita. */}
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-4 md:px-6 md:py-8">
        <ProfileSection profile={profile} onProfileChange={setProfile} />
      </div>
    </div>
  )
}
