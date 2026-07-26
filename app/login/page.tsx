import { AuthBackground } from "@/components/auth/AuthBackground"
import { UserLoginForm } from "@/components/auth/UserLoginForm"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ password_updated?: string; error?: string }>
}) {
  const params = await searchParams
  const passwordUpdated = params.password_updated === "1"
  const isRecoveryError = params.error === "recovery_error"

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <AuthBackground />
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Entrar na conta
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Acesse o fórum, salve preferências e participe da comunidade.
          </p>
        </div>

        {passwordUpdated && (
          <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-600 dark:text-green-400">
            Senha atualizada com sucesso! Faça login com sua nova senha.
          </div>
        )}

        {isRecoveryError && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Link de redefinição inválido ou expirado.{" "}
            <a href="/forgot-password" className="underline">
              Solicite um novo.
            </a>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/30">
          <UserLoginForm />
        </div>
      </div>
    </div>
  )
}
