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

/** Convite público do servidor, mostrado a quem ainda não é membro. */
export function getDiscordInviteUrl(): string | null {
  return (
    process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim() ||
    process.env.DISCORD_INVITE_URL?.trim() ||
    null
  )
}
