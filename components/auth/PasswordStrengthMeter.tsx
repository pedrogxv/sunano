"use client"

import { Check, X } from "lucide-react"

import { getPasswordStrength } from "@/lib/password-policy"
import { cn } from "@/lib/utils"

const LEVEL_BAR_COLOR: Record<string, string> = {
  weak: "bg-red-500",
  medium: "bg-yellow-400",
  strong: "bg-emerald-500",
}

const LEVEL_TEXT_COLOR: Record<string, string> = {
  weak: "text-red-500",
  medium: "text-yellow-500",
  strong: "text-emerald-500",
}

const LEVEL_GLOW: Record<string, string> = {
  weak: "shadow-[0_0_12px_-2px_theme(colors.red.500/60%)]",
  medium: "shadow-[0_0_12px_-2px_theme(colors.yellow.400/60%)]",
  strong: "shadow-[0_0_12px_-2px_theme(colors.emerald.500/60%)]",
}

const MAX_SCORE = 6

interface PasswordStrengthMeterProps {
  password: string
  className?: string
  /** Mínimo de caracteres exigido (varia em dev/localhost). Default 8. */
  minLength?: number
}

export function PasswordStrengthMeter({ password, className, minLength }: PasswordStrengthMeterProps) {
  const { score, level, label, requirements } = getPasswordStrength(password, minLength)

  if (!password) return null

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-1.5">
        <div className="flex gap-1">
          {Array.from({ length: MAX_SCORE }, (_, i) => i + 1).map((i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-all duration-300 ease-out",
                i <= score ? cn(LEVEL_BAR_COLOR[level], LEVEL_GLOW[level]) : "bg-muted"
              )}
            />
          ))}
        </div>
        <p className={cn("text-xs font-semibold transition-colors duration-300", LEVEL_TEXT_COLOR[level])}>
          {label}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {requirements.map((req) => (
          <div
            key={req.id}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-all duration-200 ease-out",
              req.met
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                : "border-border bg-muted/20 text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "flex size-3.5 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
                req.met ? "bg-emerald-500 text-white" : "bg-muted-foreground/20 text-muted-foreground"
              )}
            >
              {req.met ? <Check className="size-2.5" strokeWidth={3} /> : <X className="size-2.5" strokeWidth={3} />}
            </span>
            <span className="truncate">{req.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
