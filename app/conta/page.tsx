"use client"

import { AccountPageHeader } from "@/components/account/AccountPageHeader"
import { AccountJourney } from "@/components/account/AccountJourney"
import { AccountSection } from "@/components/account/AccountSection"
import { ProfileLoadError } from "@/components/account/ProfileLoadError"
import { SunanoLoader } from "@/components/ui/SunanoLoader"
import { useAccountSummary } from "@/lib/hooks/use-account-summary"
import { useOwnProfile } from "@/lib/hooks/use-own-profile"

export default function ContaPage() {
  const { profile, loading, error, reload } = useOwnProfile()
  // Em paralelo ao perfil: o hero não espera por ele, e falhar só tira os números.
  const { summary, loading: summaryLoading } = useAccountSummary()

  // Antes do `error`: sem ele um perfil que não carrega deixava esta página
  // — a única que cadastra 2FA — no esqueleto para sempre.
  if (error) return <ProfileLoadError onRetry={reload} />

  if (loading || !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <SunanoLoader />
      </div>
    )
  }

  return (
    <div className="pb-16">
      <AccountPageHeader profile={profile} width="max-w-6xl" showEditProfile summary={summary} summaryLoading={summaryLoading} />

      <div className="mx-auto max-w-6xl px-2 py-8 sm:px-4 md:px-6">
        {summary && <AccountJourney summary={summary} />}
        <AccountSection
          email={profile.email}
          lgpdConsentAt={profile.lgpd_consent_at ?? null}
          lgpdConsentVersion={profile.lgpd_consent_version ?? null}
        />
      </div>
    </div>
  )
}
