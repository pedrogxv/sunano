"use client"

import { OAuthButton } from "@/components/auth/OAuthButton"
import { DiscordIcon } from "@/components/auth/provider-icons"

interface DiscordAuthButtonProps {
  /** Texto do botão. Ex.: "Continuar com Discord" ou "Cadastrar com Discord". */
  label: string
  /** Rota para onde redirecionar após autenticar. Default: "/forum". */
  next?: string
}

export function DiscordAuthButton({ label, next = "/forum" }: DiscordAuthButtonProps) {
  return (
    <OAuthButton
      provider="discord"
      label={label}
      next={next}
      icon={<DiscordIcon />}
    />
  )
}
