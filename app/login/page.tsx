import { UserLoginForm } from "@/components/auth/UserLoginForm"

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Entrar na conta
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Acesse o fórum, salve preferências e participe da comunidade.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/30">
          <UserLoginForm />
        </div>
      </div>
    </div>
  )
}
