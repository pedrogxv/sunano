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

/**
 * Cookie que marca um navegador como "dispositivo confiável" — permite
 * pular o desafio TOTP por até `TRUSTED_DEVICE_MAX_AGE_SECONDS` depois de um
 * primeiro 2FA bem-sucedido (opt-in, ver TwoFactorVerifyForm). O valor é um
 * token opaco; o hash dele é o que fica em `mfa_trusted_devices` — a
 * validação em si (server-only) mora em
 * `lib/server/repositories/mfa-trusted-devices-repository.ts`.
 */
export const TRUSTED_DEVICE_COOKIE_NAME = "sunano_mfa_trusted"

/** 30 dias — prazo padrão de mercado para "lembrar este dispositivo" (NIST 800-63B). */
export const TRUSTED_DEVICE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

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
