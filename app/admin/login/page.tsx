"use client"

import { Suspense } from "react"

import { AdminLoginForm } from "@/components/admin/AdminLoginForm"
import { AuthBackground } from "@/components/auth/AuthBackground"
import { useT } from "@/lib/use-t"

export default function AdminLoginPage() {
  const t = useT()

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <AuthBackground />
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            {t.admin.login.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t.admin.login.description}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/30">
          {/* AdminLoginForm lê a query string (`useSearchParams`) para exibir o
              erro devolvido pelo login OAuth. */}
          <Suspense fallback={null}>
            <AdminLoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
