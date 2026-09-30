import { AdminLoginPanel } from "@/components/admin/AdminLoginPanel"
import { AuthBackground } from "@/components/auth/AuthBackground"

// Server Component para o fundo poder buscar o conteúdo real do site; a parte
// que depende de i18n no cliente (`useT`) mora em `AdminLoginPanel`.
export default function AdminLoginPage() {
  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <AuthBackground />
      <AdminLoginPanel />
    </div>
  )
}
