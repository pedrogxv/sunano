import { redirect } from "next/navigation"
import { ShieldCheck } from "lucide-react"

import { AuthBackground } from "@/components/auth/AuthBackground"
import { LgpdConsentForm } from "@/components/auth/LgpdConsentForm"
import { sanitizeNextPath } from "@/lib/auth-mfa"
import { hasRecordedLgpdConsent } from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"

// Passo obrigatório pós-login social (Google/Discord): o cadastro por
// e-mail/senha já exige o checkbox de consentimento LGPD antes de criar a
// conta, mas o OAuth cria a conta direto no callback, sem esse ponto de
// bloqueio. Esta página fecha essa lacuna — ver app/auth/callback/route.ts.
export default async function ConsentimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const next = sanitizeNextPath(params.next)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Já consentiu (ex: voltou pra essa URL depois de aceitar) — nada a fazer.
  if (await hasRecordedLgpdConsent(user.id)) {
    redirect(next)
  }

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <AuthBackground />
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="size-6 text-primary" />
            </div>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Antes de continuar
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Precisamos do seu aceite à Política de Privacidade para tratar seus dados em
            conformidade com a LGPD.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/30">
          <LgpdConsentForm next={next} />
        </div>
      </div>
    </div>
  )
}
