/**
 * Versão vigente da Política de Privacidade para fins de registro de
 * consentimento LGPD (Art. 7 e Art. 8 da Lei 13.709/2018).
 *
 * Compartilhada entre o cadastro por e-mail/senha (app/register/actions.ts)
 * e o gate de consentimento do OAuth (app/consentimento/actions.ts) para que
 * as duas trilhas de criação de conta nunca gravem versões divergentes.
 * Deve ser mantida em sincronia com CURRENT_VERSION em app/privacidade/page.tsx.
 */
export const LGPD_POLICY_VERSION = "2026-06"
