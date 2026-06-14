"use client"

import { OAuthButton } from "@/components/auth/OAuthButton"
import { GoogleIcon } from "@/components/auth/provider-icons"

interface GoogleAuthButtonProps {
  /** Texto do botão. Ex.: "Continuar com Google" ou "Cadastrar com Google". */
  label: string
  /** Rota para onde redirecionar após autenticar. Default: "/forum". */
  next?: string
}

export function GoogleAuthButton({ label, next = "/forum" }: GoogleAuthButtonProps) {
  return (
    <OAuthButton
      provider="google"
      label={label}
      next={next}
      icon={<GoogleIcon />}
    />
  )
}
