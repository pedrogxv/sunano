import { AdminLoginForm } from "@/components/admin/AdminLoginForm"

export default function AdminLoginPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#0a0d14] px-4 py-10 text-slate-100">
      <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-6xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0d1117] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.12),transparent_28%)]" />
            <div className="relative space-y-6">
              <div className="inline-flex items-center gap-3 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200">
                <span className="size-2 rounded-full bg-cyan-300" />
                Admin acess only
              </div>

              <div className="space-y-3">
                <h1 className="max-w-xl font-display text-4xl font-bold tracking-tight text-slate-50 md:text-5xl">
                  Acesso ao painel administrativo.
                </h1>
                <p className="max-w-xl text-base leading-7 text-slate-400">
                  Entre com sua conta Supabase para gerenciar periféricos, posts e configurações do site.
                </p>
              </div>

              <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <p className="font-medium text-slate-100">Protegido por sessão</p>
                  <p className="mt-1 text-slate-400">As rotas admin exigem login autenticado.</p>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <p className="font-medium text-slate-100">Escrita controlada</p>
                  <p className="mt-1 text-slate-400">RLS bloqueia escrita sem usuário autenticado.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center">
            <div className="w-full rounded-3xl border border-white/[0.08] bg-[#0d1117] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
              <div className="mb-6 space-y-2">
                <h2 className="text-2xl font-semibold text-slate-50">Entrar no admin</h2>
                <p className="text-sm text-slate-400">Use o email e a senha cadastrados no Supabase Auth.</p>
              </div>

              <AdminLoginForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}