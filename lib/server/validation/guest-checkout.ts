import "server-only"
import * as z from "zod"

/**
 * Validação de CPF com dígitos verificadores (não só formato/tamanho) —
 * o dado vem direto do cliente e precisa ser confiável o bastante para
 * mandar pra API da MisticPay.
 */
export function isValidCPF(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "")
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

/**
 * Nome+CPF enviados por um usuário logado que ainda não tem esses dados no
 * perfil (sem e-mail, que já vem da sessão), para o checkout/anúncio
 * completar o perfil no mesmo request em vez de mandar a pessoa para uma
 * tela de edição que não existe. Compartilhado entre `store/checkout` e
 * `market/listings` — os dois cobram PIX e exigem o mesmo par de dados.
 */
export const payerInfoSchema = z.object({
  guestName: z
    .string("Informe seu nome completo.")
    .trim()
    .min(2, "Informe seu nome completo.")
    .max(200, "Informe seu nome completo."),
  guestDocument: z
    .string("Informe um CPF válido.")
    .transform((value) => value.replace(/\D/g, ""))
    .refine(isValidCPF, "Informe um CPF válido."),
})

export type PayerInfo = z.infer<typeof payerInfoSchema>

/**
 * Telefone + endereço do pagador — só exigidos no checkout de CARTÃO: a
 * Asaas Checkout recusa criar o customer sem esses campos (`invalid_object`
 * em `phone`/`address`/`addressNumber`/`postalCode`/`province`/`city`), mas
 * o PIX segue funcionando sem eles. `state` aqui é a UF (sigla de 2 letras),
 * que mapeamos para `province` na chamada à Asaas.
 */
export const payerAddressSchema = z.object({
  guestPhone: z
    .string("Informe um telefone válido.")
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => value.length === 10 || value.length === 11, "Informe um telefone válido."),
  guestPostalCode: z
    .string("Informe um CEP válido.")
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => value.length === 8, "Informe um CEP válido."),
  guestStreet: z.string("Informe o endereço.").trim().min(2, "Informe o endereço.").max(200, "Informe o endereço."),
  guestNumber: z.string("Informe o número.").trim().min(1, "Informe o número.").max(20, "Informe o número."),
  guestComplement: z.string().trim().max(100).optional(),
  guestNeighborhood: z.string("Informe o bairro.").trim().min(1, "Informe o bairro.").max(100, "Informe o bairro."),
  guestCity: z.string("Informe a cidade.").trim().min(1, "Informe a cidade.").max(100, "Informe a cidade."),
  guestState: z
    .string("Informe o estado (UF).")
    .trim()
    .length(2, "Informe o estado (UF).")
    .transform((value) => value.toUpperCase()),
})

export type PayerAddress = z.infer<typeof payerAddressSchema>
