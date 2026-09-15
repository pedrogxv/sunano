// Fonte única da flag que liga/desliga a conquista "No Discord" (confirmar
// que é membro do servidor via OAuth do Discord, credita 50 de Aura). Mesmo
// padrão de `lib/youtube-subscription.ts` e `lib/vip-signup.ts`.
//
// Depende de `DISCORD_GUILD_ID` estar configurada — sem o ID do servidor não
// há o que verificar. A variante NEXT_PUBLIC_ existe porque o popover de
// missões da TopBar é um Client Component (ver a nota de
// project_next_public_env_client_leak no histórico: flag que "não segue a
// env" costuma ser consumidor client sem a variante pública).

export function isDiscordMembershipEnabled() {
  const value =
    process.env.DISCORD_MEMBERSHIP_ENABLED ?? process.env.NEXT_PUBLIC_DISCORD_MEMBERSHIP_ENABLED
  return value === "true"
}

/** Resultado que app/auth/discord/callback/route.ts devolve em `?discord=`. */
export type DiscordMembershipStatus =
  | "confirmed"
  | "already"
  | "not_member"
  | "account_in_use"
  | "wrong_account"
  | "login_required"
  | "canceled"
  | "email_not_verified"
  | "no_token"
  | "rate_limited"
  | "read_only"
  | "error"

/**
 * Texto do toast para cada resultado. Fonte única para /aura e /conquistas,
 * que antes tinham cada uma a sua cópia (e a de /conquistas não tratava
 * `no_token`).
 */
export function getDiscordMembershipFeedback(status: string): {
  tone: "success" | "info" | "error"
  message: string
} {
  switch (status) {
    case "confirmed":
      return { tone: "success", message: "Discord conectado! +50 de Aura e a conquista No Discord." }
    case "already":
      return { tone: "info", message: "Você já tinha resgatado essa conquista." }
    case "not_member":
      return {
        tone: "error",
        message: "Não encontramos você no nosso servidor do Discord. Entre no servidor e tente de novo.",
      }
    case "account_in_use":
      return {
        tone: "error",
        message: "Essa conta do Discord já está ligada a outro perfil do site. Cada conta do Discord vale para um perfil só.",
      }
    case "wrong_account":
      return {
        tone: "error",
        message:
          "Você autorizou uma conta do Discord diferente da que está vinculada ao seu perfil. Troque de conta no Discord e tente de novo.",
      }
    case "login_required":
      return { tone: "error", message: "Sua sessão expirou. Entre de novo e tente conectar o Discord." }
    case "canceled":
      return { tone: "error", message: "Você cancelou a autorização do Discord." }
    case "email_not_verified":
      return {
        tone: "error",
        message: "O e-mail da sua conta do Discord não está verificado. Verifique o e-mail no Discord e tente de novo.",
      }
    case "read_only":
      return { tone: "error", message: "Sessão de acesso é somente leitura." }
    case "no_token":
      return { tone: "error", message: "O Discord não devolveu a autorização. Tente novamente." }
    case "rate_limited":
      return { tone: "error", message: "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo." }
    default:
      return { tone: "error", message: "Não foi possível confirmar seu Discord. Tente novamente." }
  }
}

/** Convite público do servidor, mostrado a quem ainda não é membro. */
export function getDiscordInviteUrl(): string | null {
  return (
    process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim() ||
    process.env.DISCORD_INVITE_URL?.trim() ||
    null
  )
}
