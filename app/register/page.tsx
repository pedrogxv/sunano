import { UserRegisterForm } from "@/components/auth/UserRegisterForm"

export default function RegisterPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Criar conta
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cadastre-se para comentar, participar do fórum e comprar na loja.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/30">
          <UserRegisterForm />
        </div>
      </div>
    </div>
  )
}
