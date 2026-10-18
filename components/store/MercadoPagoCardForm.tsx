"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react"
import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react"
import { Lock } from "lucide-react"

type BrickProps = ComponentProps<typeof CardPayment>
type BrickFormData = Parameters<BrickProps["onSubmit"]>[0]
type BrickError = Parameters<NonNullable<BrickProps["onError"]>>[0]

/**
 * Formulário de cartão NO NOSSO SITE (Mercado Pago, Card Payment Brick).
 *
 * Os campos são iframes do Mercado Pago: número, validade e CVV vão do
 * navegador direto para lá e nunca passam pelo nosso servidor (PCI SAQ A). O
 * que sai daqui é um token de uso único, entregue a `onPay`. Quem cobra é a
 * NOSSA rota — o checkout na primeira tentativa (o pedido nasce junto com a
 * cobrança) e `/api/store/orders/[id]/card-payment` numa nova tentativa —, e é
 * ela que conta tentativas e barra robô testando cartão roubado.
 *
 * O valor passado ao Brick é só para ele calcular as parcelas na tela: o que
 * vale é o total calculado no servidor.
 */

let initializedKey: string | null = null
function ensureMercadoPago(publicKey: string) {
  if (initializedKey === publicKey) return
  initMercadoPago(publicKey, { locale: "pt-BR" })
  initializedKey = publicKey
}

const BRICK_BACKGROUND = "#121214"

/**
 * Script antifraude do Mercado Pago: cria `window.MP_DEVICE_SESSION_ID`, que a
 * rota manda no header `X-meli-session-id`. Sem ele, o antifraude tem menos
 * sinal e recusa mais por `high_risk`. Carregado uma vez, só na tela do cartão.
 */
const SECURITY_SCRIPT_SRC = "https://www.mercadopago.com/v2/security.js"
function ensureSecurityScript() {
  if (document.querySelector(`script[src="${SECURITY_SCRIPT_SRC}"]`)) return
  const script = document.createElement("script")
  script.src = SECURITY_SCRIPT_SRC
  script.async = true
  script.setAttribute("view", "checkout")
  document.head.appendChild(script)
}

function readDeviceId(): string | null {
  const value = (window as typeof window & { MP_DEVICE_SESSION_ID?: unknown }).MP_DEVICE_SESSION_ID
  return typeof value === "string" && value ? value : null
}

/** O que as rotas de cobrança aceitam (`mercadoPagoCardSchema`, no servidor). */
export type MercadoPagoCardPayload = {
  token: string
  payment_method_id: string
  issuer_id: string | number | null | undefined
  installments: number
  payer: { identification: { type: string; number: string } | null }
  device_id: string | null
}

/** `error` = recusado ou falhou: o Brick volta ao formulário com a mensagem. */
export type MercadoPagoPayResult = { ok: true } | { ok: false; error: string }

interface MercadoPagoCardFormProps {
  amountCents: number
  maxInstallments: number
  payerEmail: string | null
  /** Cobra o cartão. Quem chama decide a rota e o que fazer depois do `ok`. */
  onPay: (card: MercadoPagoCardPayload) => Promise<MercadoPagoPayResult>
}

export function MercadoPagoCardForm({ amountCents, maxInstallments, payerEmail, onPay }: MercadoPagoCardFormProps) {
  const publicKey = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY
  const [error, setError] = useState<string | null>(null)
  const [brickFailed, setBrickFailed] = useState(false)
  // Props ESTÁVEIS: o Brick se remonta quando elas mudam de identidade, e
  // mostrar a mensagem de recusa (re-render) apagaria o cartão digitado.
  const onPayRef = useRef(onPay)
  useEffect(() => {
    onPayRef.current = onPay
  }, [onPay])
  useEffect(() => {
    ensureSecurityScript()
  }, [])

  const initialization = useMemo(
    () => ({ amount: amountCents / 100, ...(payerEmail ? { payer: { email: payerEmail } } : {}) }),
    [amountCents, payerEmail]
  )
  const customization = useMemo(
    () => ({
      paymentMethods: {
        maxInstallments,
        // A Loja vende no CRÉDITO (o acréscimo e as parcelas são de crédito).
        types: { excluded: ["debit_card" as const, "prepaid_card" as const] },
      },
      visual: {
        // O título do Brick diz "crédito ou débito", e o débito está excluído
        // acima. O cabeçalho é nosso (ver o retorno).
        hideFormTitle: true,
        style: {
          theme: "dark",
          customVariables: {
            baseColor: "#10b981",
            // Mesmo fundo do card que envolve o Brick: ele vira o próprio card,
            // sem uma caixa dentro da outra.
            formBackgroundColor: BRICK_BACKGROUND,
            formPadding: "0px",
            borderRadiusMedium: "10px",
            borderRadiusLarge: "0px",
          },
        },
      },
    }),
    [maxInstallments]
  )

  // Falha de inicialização (CSP, rede, credencial) nem sempre chega ao
  // `onError`: o SDK só loga "Bricks component initialization failed" e o
  // espaço do formulário fica em branco. Sem `onReady` a tempo, cai no aviso.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (ready) return
    const timer = setTimeout(() => setBrickFailed(true), 20_000)
    return () => clearTimeout(timer)
  }, [ready])
  const handleReady = useCallback(() => setReady(true), [])

  const handleError = useCallback((err: BrickError) => {
    console.error("[MercadoPagoCardForm]", err)
    // Erro crítico = o Brick não monta (public key inválida, script bloqueado).
    if (err?.type === "critical") setBrickFailed(true)
  }, [])

  const handleSubmit = useCallback(
    async (formData: BrickFormData) => {
      setError(null)
      const result = await onPayRef
        .current({
          token: formData.token,
          payment_method_id: formData.payment_method_id,
          issuer_id: formData.issuer_id,
          installments: formData.installments,
          payer: { identification: formData.payer?.identification ?? null },
          device_id: readDeviceId(),
        })
        .catch((): MercadoPagoPayResult => ({
          ok: false,
          error: "Não foi possível processar o cartão agora. Tente de novo em instantes",
        }))

      if (!result.ok) {
        setError(result.error)
        // Rejeitar devolve o Brick ao formulário para a pessoa tentar de novo.
        throw new Error(result.error)
      }
    },
    []
  )

  if (!publicKey || brickFailed) {
    return (
      <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
        Pagamento com cartão indisponível no momento. Use o PIX
      </p>
    )
  }
  ensureMercadoPago(publicKey)

  return (
    <div className="space-y-3">
      <div className="space-y-5 rounded-xl border border-border p-5 sm:p-7" style={{ backgroundColor: BRICK_BACKGROUND }}>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-foreground">Dados do cartão</h2>
          <p className="text-sm text-muted-foreground">
            {maxInstallments > 1
              ? `Somente crédito · as opções de parcelamento (até ${maxInstallments}x) aparecem ao digitar o número do cartão`
              : "Somente cartão de crédito"}
          </p>
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}
        <CardPayment
          initialization={initialization}
          customization={customization}
          onReady={handleReady}
          onError={handleError}
          onSubmit={handleSubmit}
        />
      </div>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3" />
        Dados do cartão criptografados pelo Mercado Pago
      </p>
    </div>
  )
}
