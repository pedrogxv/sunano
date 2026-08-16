/**
 * Política de senha compartilhada entre cadastro e redefinição.
 *
 * Em produção exigimos senha forte (mínimo de 8 caracteres com maiúscula,
 * minúscula, número e símbolo). Em localhost/desenvolvimento a exigência é
 * relaxada para apenas um comprimento mínimo, facilitando testes.
 */

export const STRONG_PASSWORD_HINT =
  "Mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo."

const MIN_LENGTH = 8
const DEV_MIN_LENGTH = 6

/** Detecta se a requisição veio de localhost a partir do header `host`. */
export function isLocalhostHost(host: string | null | undefined): boolean {
  if (!host) return false
  const hostname = host.split(":")[0].toLowerCase()
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  )
}

/**
 * Valida a senha conforme a política. Retorna uma mensagem de erro ou `null`
 * quando a senha é aceita.
 *
 * @param relaxed quando `true` (ex.: localhost) só verifica comprimento mínimo.
 */
export function validatePassword(password: string, relaxed = false): string | null {
  if (relaxed) {
    if (password.length < DEV_MIN_LENGTH) {
      return `A senha deve ter no mínimo ${DEV_MIN_LENGTH} caracteres.`
    }
    return null
  }

  if (password.length < MIN_LENGTH) {
    return `A senha deve ter no mínimo ${MIN_LENGTH} caracteres.`
  }
  if (!/[a-z]/.test(password)) {
    return "A senha deve conter ao menos uma letra minúscula."
  }
  if (!/[A-Z]/.test(password)) {
    return "A senha deve conter ao menos uma letra maiúscula."
  }
  if (!/[0-9]/.test(password)) {
    return "A senha deve conter ao menos um número."
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "A senha deve conter ao menos um símbolo (ex.: !@#$%)."
  }
  return null
}

export type PasswordRequirementId = "length" | "lowercase" | "uppercase" | "number" | "symbol"

export interface PasswordRequirement {
  id: PasswordRequirementId
  label: string
  met: boolean
}

export type PasswordStrengthLevel = "empty" | "weak" | "medium" | "strong"

export interface PasswordStrength {
  /** 0 a 5 — quantos requisitos (incluindo o bônus de 12+ chars) a senha atende. */
  score: number
  level: PasswordStrengthLevel
  label: string
  requirements: PasswordRequirement[]
}

/**
 * Calcula a força da senha em tempo real para feedback de UI. Usa as mesmas
 * regras de `validatePassword` (modo estrito) para que o medidor nunca prometa
 * uma senha como "forte" quando o servidor ainda vai rejeitá-la.
 *
 * @param minLength comprimento mínimo exigido (8 em produção, menor em dev/localhost).
 */
export function getPasswordStrength(password: string, minLength: number = MIN_LENGTH): PasswordStrength {
  const requirements: PasswordRequirement[] = [
    { id: "length", label: `Mínimo ${minLength} caracteres`, met: password.length >= minLength },
    { id: "lowercase", label: "Uma letra minúscula", met: /[a-z]/.test(password) },
    { id: "uppercase", label: "Uma letra maiúscula", met: /[A-Z]/.test(password) },
    { id: "number", label: "Um número", met: /[0-9]/.test(password) },
    { id: "symbol", label: "Um símbolo (ex.: !@#$%)", met: /[^A-Za-z0-9]/.test(password) },
  ]

  const metCount = requirements.filter((r) => r.met).length
  const lengthBonus = password.length >= 12 ? 1 : 0
  const score = password.length === 0 ? 0 : metCount + lengthBonus

  let level: PasswordStrengthLevel = "empty"
  let label = ""
  if (password.length > 0) {
    if (metCount < requirements.length) {
      level = "weak"
      label = "Fraca"
    } else if (lengthBonus === 0) {
      level = "medium"
      label = "Boa"
    } else {
      level = "strong"
      label = "Forte"
    }
  }

  return { score, level, label, requirements }
}
