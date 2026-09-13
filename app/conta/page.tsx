"use client"

import { AccountPageHeader } from "@/components/account/AccountPageHeader"
import { AccountSection } from "@/components/account/AccountSection"
import { ProfileLoadError } from "@/components/account/ProfileLoadError"
import BoxLoader from "@/components/ui/box-loader"
import { useOwnProfile } from "@/lib/hooks/use-own-profile"

export default function ContaPage() {
  const { profile, loading, error, reload } = useOwnProfile()

  // Antes do `error`: sem ele um perfil que não carrega deixava esta página
  // — a única que cadastra 2FA — no esqueleto para sempre.
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
      <AccountPageHeader profile={profile} />

      <div className="mx-auto max-w-4xl px-2 py-8 sm:px-4 md:px-6">
        <AccountSection
          email={profile.email}
          lgpdConsentAt={profile.lgpd_consent_at ?? null}
          lgpdConsentVersion={profile.lgpd_consent_version ?? null}
        />
      </div>
    </div>
  )
}
