import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { AuthBackground } from "@/components/auth/AuthBackground"
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm"

export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/forgot-password?expired=1")
  }

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <AuthBackground />
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Redefinir senha
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Escolha uma nova senha para sua conta.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/30">
          <ResetPasswordForm />
        </div>
      </div>
    </div>
  )
}
