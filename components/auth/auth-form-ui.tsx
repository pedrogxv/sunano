"use client"

import { useState, useSyncExternalStore } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { isLocalhostHost } from "@/lib/password-policy"
import { cn } from "@/lib/utils"

/**
 * Átomos dos formulários de conta (entrar, cadastrar, esqueci/redefinir
 * senha), usados pelo AuthModal e pelas páginas /login, /register,
 * /forgot-password e /reset-password. Antes cada form trazia a sua cópia do
 * campo, do aviso de erro, do divisor "ou" e do botão de enviar — com altura,
 * cor e texto de carregamento diferentes —, e o modal e a página divergiam.
 */

const noopSubscribe = () => () => {}

/**
 * Mínimo de caracteres da senha nova, com a mesma régua do servidor
 * (`validatePassword` + `isLocalhostHost`): 6 em localhost, 8 no resto. O
 * host só existe no navegador; no servidor vale a regra estrita.
 */
export function usePasswordMinLength() {
  const relaxed = useSyncExternalStore(
    noopSubscribe,
    () => isLocalhostHost(window.location.host, true),
    () => false
  )
  return { relaxed, minLength: relaxed ? 6 : 8 }
}

/** Campo de altura de toque (40px), igual em todo form de conta. */
const FIELD_INPUT = "h-10 rounded-xl border-border bg-muted/20 px-3 dark:bg-muted/20"

export function AuthField({
  id,
  label,
  hint,
  aside,
  children,
}: {
  id: string
  label: string
  /** Texto de ajuda embaixo do campo. */
  hint?: React.ReactNode
  /** Ação na linha do rótulo (ex.: "Esqueceu a senha?"). */
  aside?: React.ReactNode
  /** Campo próprio (ex.: senha com medidor); sem ele, recebe `AuthInput`. */
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-[13px] font-medium text-foreground" htmlFor={id}>
          {label}
        </label>
        {aside}
      </div>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function AuthInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return <Input className={cn(FIELD_INPUT, className)} {...props} />
}

/**
 * Senha com botão de mostrar/ocultar. O botão fica fora da ordem de Tab
 * (quem navega pelo teclado vai do campo direto ao próximo) e não envia o
 * form. Errar a senha por não ver o que digitou é a falha de login mais comum
 * no celular.
 */
export function AuthPasswordInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cn(FIELD_INPUT, "pr-11", className)} {...props} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

/** Divisor "ou" entre o login social e o por email. Linhas próprias: não depende da cor do fundo. */
export function AuthDivider({ label = "ou" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
      {label}
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
    </div>
  )
}

const ALERT_TONE = {
  error: { box: "border-destructive/30 bg-destructive/10 text-destructive", icon: AlertCircle },
  success: { box: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", icon: CheckCircle2 },
  info: { box: "border-border bg-muted/20 text-foreground", icon: Info },
} as const

/** Aviso dentro do form (erro, sucesso, informação). Erro é anunciado ao leitor de tela. */
export function AuthAlert({
  tone = "error",
  children,
  className,
}: {
  tone?: keyof typeof ALERT_TONE
  children: React.ReactNode
  className?: string
}) {
  const { box, icon: Icon } = ALERT_TONE[tone]
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed animate-in fade-in-0 slide-in-from-top-1 duration-200",
        box,
        className
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * Botão de enviar de todo form de conta: o estado de envio vem do próprio
 * `<form action>` (useFormStatus), com o mesmo spinner e o mesmo gradiente da
 * marca (ciano→violeta, o par do fundo de /login).
 */
export function AuthSubmitButton({
  children,
  pendingLabel,
  disabled = false,
}: {
  children: React.ReactNode
  pendingLabel: string
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      className="relative h-11 w-full overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 text-[15px] font-semibold text-white shadow-lg shadow-violet-500/20 transition-[filter,transform,box-shadow] hover:brightness-110 hover:shadow-violet-500/30 active:scale-[0.98] disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none"
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending ? pendingLabel : children}
    </Button>
  )
}

/** Link de texto dos forms ("Cadastre-se", "Voltar ao login"). Com `onClick`, troca de tela sem navegar (modal). */
export function AuthTextLink({
  href,
  onClick,
  className,
  children,
}: {
  href: string
  onClick?: () => void
  className?: string
  children: React.ReactNode
}) {
  const cls = cn("font-medium text-foreground underline-offset-4 hover:underline", className)
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {children}
      </button>
    )
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  )
}

/** Rodapé "Não tem conta? Cadastre-se" / "Já tem conta? Entrar". */
export function AuthSwitchPrompt({ children }: { children: React.ReactNode }) {
  return <p className="text-center text-[13px] text-muted-foreground">{children}</p>
}
