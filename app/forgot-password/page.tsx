import Link from "next/link"

import { AuthBackground } from "@/components/auth/AuthBackground"
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm"

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>
}) {
  const params = await searchParams
  const isExpired = params.expired === "1"

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <AuthBackground />
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Esqueceu a senha?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Informe seu email e enviaremos um link para redefinir sua senha.
          </p>
        </div>

        {isExpired && (
          <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-400">
            Seu link de redefinição expirou ou já foi usado. Solicite um novo abaixo.
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/30">
          <ForgotPasswordForm />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Lembrou a senha?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  )
}
