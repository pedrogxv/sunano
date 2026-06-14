"use client"

import { useEffect, useState } from "react"
import { KeyRound, Mail, ShieldCheck, ShieldOff, Smartphone } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { supabaseAuth } from "@/lib/client/supabase-auth"

interface SecurityTabProps {
  email: string | null
}

function PasswordStrength({ password }: { password: string }) {
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
    password.length >= 12,
  ].filter(Boolean).length

  const labels = ["", "Fraca", "Razoável", "Boa", "Forte", "Muito forte"]
  const colors = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-emerald-400", "bg-emerald-500"]

  if (!password) return null

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? colors[score] : "bg-muted"}`} />
        ))}
      </div>
      <p className={`text-[10px] font-medium ${score >= 4 ? "text-emerald-400" : score >= 2 ? "text-yellow-400" : "text-red-400"}`}>
        {labels[score]}
      </p>
    </div>
  )
}

export function SecurityTab({ email }: SecurityTabProps) {
  // ── Senha ──
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)

  // ── 2FA ──
  const [loadingMfa, setLoadingMfa] = useState(true)
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null)
  const [enroll, setEnroll] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null)
  const [otp, setOtp] = useState("")
  const [busyMfa, setBusyMfa] = useState(false)

  useEffect(() => {
    refreshFactors()
  }, [])

  async function refreshFactors() {
    try {
      setLoadingMfa(true)
      const { data, error } = await supabaseAuth.auth.mfa.listFactors()
      if (error) throw error
      const verified = data.totp.find((f) => f.status === "verified")
      setVerifiedFactorId(verified?.id ?? null)
    } catch {
      setVerifiedFactorId(null)
    } finally {
      setLoadingMfa(false)
    }
  }

  async function updatePassword() {
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não conferem.")
      return
    }
    try {
      setSavingPassword(true)
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string; ok?: boolean } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "")
      setNewPassword("")
      setConfirmPassword("")
      toast.success("Senha atualizada")
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Erro ao alterar senha"
      toast.error("Erro ao alterar senha", { description: message })
    } finally {
      setSavingPassword(false)
    }
  }

  async function sendResetEmail() {
    if (!email) return
    try {
      setSendingReset(true)
      const redirectTo = `${window.location.origin}/auth/callback?type=recovery`
      const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw error
      toast.success("Link enviado", { description: "Verifique seu email para redefinir a senha." })
    } catch {
      toast.error("Não foi possível enviar o link. Tente novamente.")
    } finally {
      setSendingReset(false)
    }
  }

  async function startEnroll() {
    try {
      setBusyMfa(true)
      // Remove fatores TOTP não verificados que tenham sobrado de tentativas anteriores.
      const { data: list } = await supabaseAuth.auth.mfa.listFactors()
      const stale = list?.totp.filter((f) => f.status !== "verified") ?? []
      await Promise.all(stale.map((f) => supabaseAuth.auth.mfa.unenroll({ factorId: f.id })))

      const { data, error } = await supabaseAuth.auth.mfa.enroll({ factorType: "totp" })
      if (error) throw error
      setEnroll({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
      setOtp("")
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Erro ao iniciar 2FA"
      toast.error("Erro ao ativar 2FA", { description: message })
    } finally {
      setBusyMfa(false)
    }
  }

  async function confirmEnroll() {
    if (!enroll) return
    try {
      setBusyMfa(true)
      const challenge = await supabaseAuth.auth.mfa.challenge({ factorId: enroll.factorId })
      if (challenge.error) throw challenge.error
      const verify = await supabaseAuth.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: challenge.data.id,
        code: otp.trim(),
      })
      if (verify.error) throw verify.error
      setEnroll(null)
      setOtp("")
      toast.success("2FA ativado")
      await refreshFactors()
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Código inválido"
      toast.error("Não foi possível validar o código", { description: message })
    } finally {
      setBusyMfa(false)
    }
  }

  async function cancelEnroll() {
    if (enroll) {
      await supabaseAuth.auth.mfa.unenroll({ factorId: enroll.factorId }).catch(() => {})
    }
    setEnroll(null)
    setOtp("")
  }

  async function disable2fa() {
    if (!verifiedFactorId) return
    try {
      setBusyMfa(true)
      const { error } = await supabaseAuth.auth.mfa.unenroll({ factorId: verifiedFactorId })
      if (error) throw error
      toast.success("2FA desativado")
      await refreshFactors()
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Erro ao desativar 2FA"
      toast.error("Erro ao desativar 2FA", { description: message })
    } finally {
      setBusyMfa(false)
    }
  }

  const passwordsMismatch = Boolean(confirmPassword) && confirmPassword !== newPassword

  return (
    <div className="space-y-6">
      {/* ── Senha ── */}
      <Card className="border-border bg-card/90">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-primary" />
            Senha
          </CardTitle>
          <CardDescription>Defina uma nova senha ou receba um link de redefinição por email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nova senha</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="border-border bg-background"
                placeholder="Mín. 8 caracteres"
              />
              <PasswordStrength password={newPassword} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confirmar senha</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`border-border bg-background ${passwordsMismatch ? "border-red-500/50" : ""}`}
                placeholder="Repita a senha"
              />
              {passwordsMismatch && <p className="text-[10px] text-red-400">As senhas não conferem</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={sendResetEmail} disabled={sendingReset || !email} className="gap-2" size="sm">
              <Mail className="size-4" />
              {sendingReset ? "Enviando..." : "Enviar link por email"}
            </Button>
            <Button onClick={updatePassword} disabled={savingPassword || !newPassword || passwordsMismatch} className="gap-2 min-w-32">
              <KeyRound className="size-4" />
              {savingPassword ? "Salvando..." : "Atualizar senha"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── 2FA ── */}
      <Card className="border-border bg-card/90">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="size-4 text-primary" />
            Autenticação em dois fatores (2FA)
          </CardTitle>
          <CardDescription>
            Use um app autenticador (Google Authenticator, Authy, 1Password) para um código a cada login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          {loadingMfa ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : enroll ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                1. Escaneie o QR Code no seu app autenticador (ou digite o código manual).
              </p>
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={enroll.qrCode}
                  alt="QR Code 2FA"
                  className="size-44 rounded-lg border border-border bg-white p-2"
                />
                <div className="flex-1 space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Código manual</p>
                    <code className="block break-all rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                      {enroll.secret}
                    </code>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      2. Digite o código de 6 dígitos
                    </label>
                    <Input
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="border-border bg-background tracking-[0.4em]"
                      placeholder="000000"
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="ghost" onClick={cancelEnroll} disabled={busyMfa} size="sm">
                  Cancelar
                </Button>
                <Button onClick={confirmEnroll} disabled={busyMfa || otp.length !== 6} className="gap-2" size="sm">
                  <ShieldCheck className="size-4" />
                  {busyMfa ? "Validando..." : "Ativar 2FA"}
                </Button>
              </div>
            </div>
          ) : verifiedFactorId ? (
            <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-5 text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">2FA está ativo</p>
                  <p className="text-xs text-muted-foreground">Sua conta exige um código do autenticador.</p>
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={busyMfa} className="gap-2 text-red-400 hover:text-red-300">
                    <ShieldOff className="size-4" />
                    Desativar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Desativar 2FA?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Sua conta deixará de exigir o código do autenticador. Você pode reativar a qualquer momento.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={disable2fa} className="bg-red-500 text-white hover:bg-red-600">
                      Desativar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-border bg-muted/10 p-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <ShieldOff className="size-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">2FA está desativado</p>
                  <p className="text-xs text-muted-foreground">Adicione uma camada extra de segurança à sua conta.</p>
                </div>
              </div>
              <Button onClick={startEnroll} disabled={busyMfa} className="gap-2" size="sm">
                <ShieldCheck className="size-4" />
                {busyMfa ? "Gerando..." : "Ativar 2FA"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
