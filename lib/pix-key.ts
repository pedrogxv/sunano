/**
 * Validação e formatação de chave PIX — helpers PUROS, importáveis tanto pelo
 * formulário de saque (client) quanto pela rota `POST /api/afiliados/saques`
 * (server). Mora aqui, e não em `lib/server/validation/`, justamente porque o
 * cliente precisa validar enquanto a pessoa digita: a chave errada só aparece
 * depois que o dinheiro saiu, então o erro tem que ser impossível de ignorar
 * ANTES de enviar.
 *
 * `isValidCPF` é reimplementado aqui (em vez de importado de
 * `lib/server/validation/guest-checkout.ts`) porque aquele módulo é
 * `server-only` e importá-lo quebraria o build do client component.
 */

export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random"

export const PIX_KEY_TYPES: readonly PixKeyType[] = ["cpf", "cnpj", "email", "phone", "random"]

export const PIX_KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  phone: "Celular",
  random: "Chave aleatória",
}

export const PIX_KEY_PLACEHOLDERS: Record<PixKeyType, string> = {
  cpf: "000.000.000-00",
  cnpj: "00.000.000/0000-00",
  email: "voce@email.com",
  phone: "(00) 00000-0000",
  random: "00000000-0000-0000-0000-000000000000",
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "")
}

/** CPF com dígitos verificadores — formato/tamanho sozinhos aceitariam "111.111.111-11". */
export function isValidCPF(raw: string): boolean {
  const cpf = onlyDigits(raw)
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const digits = cpf.split("").map(Number)

  let sum = 0
  for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i)
  let check1 = (sum * 10) % 11
  if (check1 === 10) check1 = 0
  if (check1 !== digits[9]) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += digits[i] * (11 - i)
  let check2 = (sum * 10) % 11
  if (check2 === 10) check2 = 0
  if (check2 !== digits[10]) return false

  return true
}

/** CNPJ com os dois dígitos verificadores. */
export function isValidCNPJ(raw: string): boolean {
  const cnpj = onlyDigits(raw)
  if (cnpj.length !== 14) return false
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  const digits = cnpj.split("").map(Number)
  const check = (length: number) => {
    let weight = length - 7
    let sum = 0
    for (let i = 0; i < length; i++) {
      sum += digits[i] * weight
      weight -= 1
      if (weight < 2) weight = 9
    }
    const result = sum % 11
    return result < 2 ? 0 : 11 - result
  }

  return check(12) === digits[12] && check(13) === digits[13]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Normaliza a chave para o formato que o banco/gateway espera: documentos e
 * telefone viram só dígitos (telefone com +55), e-mail vira minúsculo. O que
 * a pessoa vê no input continua mascarado — a máscara é enfeite, isto aqui é
 * o dado.
 */
export function normalizePixKey(type: PixKeyType, raw: string): string {
  const value = raw.trim()
  switch (type) {
    case "cpf":
    case "cnpj":
      return onlyDigits(value)
    case "phone": {
      const digits = onlyDigits(value)
      const national = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits
      return `+55${national}`
    }
    case "email":
      return value.toLowerCase()
    case "random":
      return value.toLowerCase()
  }
}

/** `null` quando a chave está válida; a mensagem de erro (pt-BR) quando não. */
export function validatePixKey(type: PixKeyType, raw: string): string | null {
  const value = raw.trim()
  if (!value) return "Informe sua chave PIX."

  switch (type) {
    case "cpf":
      return isValidCPF(value) ? null : "CPF inválido. Confira os números digitados."
    case "cnpj":
      return isValidCNPJ(value) ? null : "CNPJ inválido. Confira os números digitados."
    case "email":
      return EMAIL_RE.test(value) && value.length <= 200 ? null : "E-mail inválido."
    case "phone": {
      const digits = onlyDigits(value)
      const national = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits
      return national.length === 11 && national[2] === "9"
        ? null
        : "Celular inválido. Use DDD + 9 dígitos."
    }
    case "random":
      return UUID_RE.test(value)
        ? null
        : "Chave aleatória inválida. Ela tem 32 caracteres separados por hífens."
  }
}

/** Máscara de digitação por tipo — e-mail e chave aleatória passam direto. */
export function formatPixKeyInput(type: PixKeyType, value: string): string {
  switch (type) {
    case "cpf":
      return onlyDigits(value)
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
    case "cnpj":
      return onlyDigits(value)
        .slice(0, 14)
        .replace(/(\d{2})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1/$2")
        .replace(/(\d{4})(\d{1,2})$/, "$1-$2")
    case "phone": {
      const digits = onlyDigits(value).replace(/^55/, "").slice(0, 11)
      if (digits.length <= 10) {
        return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, (_, ddd, p1, p2) =>
          p2 ? `(${ddd}) ${p1}-${p2}` : `(${ddd}) ${p1}`
        )
      }
      return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, ddd, p1, p2) =>
        p2 ? `(${ddd}) ${p1}-${p2}` : `(${ddd}) ${p1}`
      )
    }
    case "email":
    case "random":
      return value.trimStart()
  }
}

/**
 * Chave exibida parcialmente oculta no histórico: a tela pode estar aberta
 * em público e, para conferir "foi pra minha chave mesmo?", bastam as pontas.
 */
export function maskPixKey(type: PixKeyType, key: string): string {
  switch (type) {
    case "cpf": {
      const d = onlyDigits(key)
      return d.length === 11 ? `***.***.${d.slice(6, 9)}-${d.slice(9)}` : key
    }
    case "cnpj": {
      const d = onlyDigits(key)
      return d.length === 14 ? `**.***.***/${d.slice(8, 12)}-${d.slice(12)}` : key
    }
    case "email": {
      const [local, domain] = key.split("@")
      if (!domain) return key
      const head = local.slice(0, 2)
      return `${head}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`
    }
    case "phone": {
      const d = onlyDigits(key).replace(/^55/, "")
      return d.length >= 10 ? `(${d.slice(0, 2)}) *****-${d.slice(-4)}` : key
    }
    case "random":
      return key.length > 12 ? `${key.slice(0, 8)}…${key.slice(-4)}` : key
  }
}
