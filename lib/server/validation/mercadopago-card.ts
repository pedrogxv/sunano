import { z } from "zod"

/**
 * O que o Card Payment Brick entrega no `onSubmit`, aceito pelas duas rotas
 * que cobram cartão no Mercado Pago: o checkout (primeira tentativa, que cria
 * o pedido junto) e `/api/store/orders/[id]/card-payment` (nova tentativa num
 * pedido que ficou pendente).
 *
 * O valor (`transaction_amount`) NÃO é lido: quem decide quanto cobrar é o
 * pedido. E-mail também não: vai o da conta, gravado no pedido.
 */
export const mercadoPagoCardSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9]{16,64}$/),
  payment_method_id: z.string().regex(/^[a-z_]{2,40}$/),
  issuer_id: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => (v == null || v === "" ? null : String(v)))
    .pipe(z.string().regex(/^\d{1,12}$/).nullable()),
  installments: z.number().int().min(1).max(24),
  payer: z
    .object({
      identification: z
        .object({
          type: z.enum(["CPF", "CNPJ"]),
          number: z
            .string()
            .transform((v) => v.replace(/\D/g, ""))
            .pipe(z.string().regex(/^(\d{11}|\d{14})$/)),
        })
        .nullish(),
    })
    .nullish(),
  /**
   * Device ID do antifraude (`MP_DEVICE_SESSION_ID`, do security.js). Vai no
   * header `X-meli-session-id`; sem ele o Mercado Pago recusa mais por
   * `high_risk`. Opcional: bloqueador de script não pode impedir a compra.
   */
  device_id: z
    .string()
    .regex(/^[A-Za-z0-9_:-]{8,128}$/)
    .nullish()
    .catch(null),
})

export type MercadoPagoCardInput = z.infer<typeof mercadoPagoCardSchema>
