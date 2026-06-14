/**
 * Helpers puros (framework-agnósticos) do fluxo de 2FA / MFA.
 *
 * O 2FA do projeto usa o MFA do Supabase, que classifica a sessão por
 * "Authenticator Assurance Level" (AAL):
 *   • `aal1` → autenticado com um fator (senha ou OAuth)
 *   • `aal2` → completou o desafio do app autenticador (TOTP)
 *
 * `signInWithPassword`/OAuth criam uma sessão `aal1` VÁLIDA. Quando o usuário
 * tem um fator TOTP verificado, o `nextLevel` é `aal2` — e cabe à aplicação
 * EXIGIR o passo do código antes de liberar qualquer recurso. Este módulo
 * concentra essa decisão num único lugar, consumido pelo middleware
 * (`proxy.ts`), pelas server actions de login e pela página `/2fa`.
 *
 * É um arquivo puro (sem segredos, sem acesso a banco), então pode ser
 * importado tanto no servidor quanto no cliente.
 */

/** Caminho da página de verificação do segundo fator. */
export const TWO_FACTOR_PATH = "/2fa"

export type AssuranceLevel = {
  current: "aal1" | "aal2" | string | null
  next: "aal1" | "aal2" | string | null
}

/**
 * Indica que o usuário precisa concluir o segundo fator: existe um fator
 * verificado (`next === "aal2"`) mas a sessão ainda está abaixo disso.
 */
export function isMfaStepUpRequired(aal: AssuranceLevel | null | undefined): boolean {
  if (!aal) return false
  return aal.next === "aal2" && aal.current !== "aal2"
}

/**
 * Garante que um destino de redirecionamento é interno e seguro, evitando
 * open-redirects (`//host`, `/\host`, URLs absolutas) vindos de `?next=`.
 */
export function sanitizeNextPath(
  next: string | null | undefined,
  fallback = "/forum"
): string {
  if (!next || !next.startsWith("/")) return fallback
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback
  return next
}
