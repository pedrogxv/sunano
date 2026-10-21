/**
 * Máscaras de digitação de documentos brasileiros (CPF, telefone, CEP). O
 * telefone de cobrança também aceita número de fora, começando com "+".
 *
 * Moram aqui, e não num componente, porque cinco telas formatam os mesmos
 * campos (checkout, Meus Pedidos, resgate físico da Central, admin de
 * pedidos e Minha conta). Elas importavam do card do checkout, o que
 * amarrava a máscara a uma tela que nem sempre estava no caminho.
 */

export function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}

/**
 * Telefone gravado de fora do Brasil: "+<DDI><número>". O brasileiro continua
 * sendo só os dígitos com DDD, sem o 55 — é o formato de toda linha antiga.
 */
export function isInternationalPhone(value: string): boolean {
  return value.trim().startsWith("+")
}

/**
 * `allowInternational`: só o telefone de COBRANÇA aceita número de fora (o
 * titular do cartão pode morar no exterior). Começou com "+", sai do padrão
 * brasileiro e vira DDI + número, sem máscara. O celular da ENTREGA não usa:
 * a transportadora liga para um celular brasileiro.
 */
export function formatPhoneInput(value: string, { allowInternational = false } = {}): string {
  if (allowInternational && isInternationalPhone(value)) {
    return `+${value.replace(/\D/g, "").slice(0, 15)}`
  }
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, (_, ddd, p1, p2) => (p2 ? `(${ddd}) ${p1}-${p2}` : `(${ddd}) ${p1}`))
  }
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, ddd, p1, p2) => (p2 ? `(${ddd}) ${p1}-${p2}` : `(${ddd}) ${p1}`))
}

/**
 * Telefone digitado → como é gravado: dígitos com DDD (Brasil) ou
 * "+<DDI><número>" (exterior). "+55 31 9..." é brasileiro escrito com DDI e
 * volta ao formato sem 55, senão o mesmo número existiria de dois jeitos.
 */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "")
  if (!isInternationalPhone(value)) return digits
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits.slice(2)
  return `+${digits}`
}

/** Brasil: DDD + 8 ou 9 dígitos. Exterior: E.164 (DDI sem zero, até 15 dígitos). */
export function isValidPhone(value: string): boolean {
  const normalized = normalizePhone(value)
  if (isInternationalPhone(normalized)) {
    return /^\+[1-9]\d{7,14}$/.test(normalized) && !normalized.startsWith("+55")
  }
  return normalized.length === 10 || normalized.length === 11
}

export function formatCepInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8)
  return digits.replace(/(\d{5})(\d{1,3})/, "$1-$2")
}

/**
 * CPF exibido parcialmente mascarado: o dado aparece numa tela que a pessoa
 * pode abrir em público, e para conferir "é o meu CPF mesmo?" bastam os
 * últimos dígitos.
 */
export function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "")
  if (digits.length !== 11) return cpf
  return `***.***.${digits.slice(6, 9)}-${digits.slice(9)}`
}
