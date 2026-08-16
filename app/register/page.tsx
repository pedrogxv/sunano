import { AuthBackground } from "@/components/auth/AuthBackground"
import { UserRegisterForm } from "@/components/auth/UserRegisterForm"
import {
  AuthMotionHeader,
  AuthMotionCard,
  ContinueWithoutAccountLink,
} from "@/components/auth/AuthPageMotion"

export default function RegisterPage() {
  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <AuthBackground />
      <div className="w-full max-w-md">
        <AuthMotionHeader>
          <div className="mb-8 text-center">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
              Criar conta
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Cadastre-se para comentar, participar do fórum e comprar na loja.
            </p>
          </div>
        </AuthMotionHeader>

        <AuthMotionCard>
          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/30">
            <UserRegisterForm />
          </div>
        </AuthMotionCard>

        <ContinueWithoutAccountLink />
      </div>
    </div>
  )
}
