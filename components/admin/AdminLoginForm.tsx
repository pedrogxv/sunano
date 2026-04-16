"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { loginAction } from "@/app/admin/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const initialState = { error: null as string | null }

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? "Entrando..." : "Entrar"}
    </Button>
  )
}

export function AdminLoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-200" htmlFor="email">
          Email
        </label>
        <Input
          autoComplete="email"
          className="border-white/10 bg-white/[0.04] text-slate-50 placeholder:text-slate-500"
          id="email"
          name="email"
          placeholder="admin@sunano.com"
          type="email"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-200" htmlFor="password">
          Senha
        </label>
        <Input
          autoComplete="current-password"
          className="border-white/10 bg-white/[0.04] text-slate-50 placeholder:text-slate-500"
          id="password"
          name="password"
          placeholder="Sua senha"
          type="password"
        />
      </div>

      {state.error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {state.error}
        </div>
      ) : null}

      <SubmitButton />
    </form>
  )
}