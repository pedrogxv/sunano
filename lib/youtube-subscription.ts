// Fonte única da flag que liga/desliga a conquista "Inscrito" (inscrição no
// canal do YouTube via OAuth, credita Aura). O fluxo depende da YouTube Data
// API devolver o status de inscrição corretamente, o que está quebrado no
// momento — desligado por padrão até ser corrigido. Mesmo padrão de
// `lib/vip-signup.ts`.

export function isYoutubeSubscriptionEnabled() {
  const value = process.env.YOUTUBE_SUBSCRIPTION_ENABLED ?? process.env.NEXT_PUBLIC_YOUTUBE_SUBSCRIPTION_ENABLED
  return value === "true"
}
