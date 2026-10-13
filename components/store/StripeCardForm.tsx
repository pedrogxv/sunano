"use client"

import { useState, type FormEvent } from "react"
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js"
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { Loader2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatBRL } from "@/lib/format"

/**
 * Formulário de cartão NO NOSSO SITE (Stripe Payment Element).
 *
 * Os campos são iframes do `js.stripe.com`: número, validade e CVV vão do
 * navegador direto para o Stripe e nunca passam pelo nosso servidor (PCI
 * SAQ A). O que sai daqui é um ConfirmationToken (`ctoken_…`), e quem
 * confirma o pagamento é a NOSSA rota (`/api/store/orders/[id]/card-payment`)
 * — é ela que conta tentativas e barra robô testando cartão roubado.
 *
 * 3DS: se o banco pedir, a rota devolve o `client_secret` e
 * `stripe.handleNextAction` abre o desafio do banco por cima da página.
 *
 * Valor, moeda e captura aqui são só para o Payment Element se montar: o
 * valor que vale é o do PaymentIntent, fixado no servidor no checkout.
 */

let stripePromise: Promise<StripeJs | null> | null = null
function getStripeJs() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    stripePromise = key ? loadStripe(key, { locale: "pt-BR" }) : Promise.resolve(null)
  }
  return stripePromise
}

type ConfirmResponse = {
  state?: "requires_action" | "processing"
  clientSecret?: string
  error?: string
}

interface StripeCardFormProps {
  orderId: string
  amountCents: number
  /** Recusa anterior a mostrar ao abrir (ex.: 3DS falhou e a página recarregou). */
  initialError?: string | null
  /** Cartão autorizado: a tela passa a aguardar o pedido virar pago. */
  onAuthorized: () => void
}

export function StripeCardForm(props: StripeCardFormProps) {
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return (
      <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
        Pagamento com cartão indisponível no momento. Use o PIX.
      </p>
    )
  }

  return (
    <Elements
      stripe={getStripeJs()}
      options={{
        mode: "payment",
        amount: props.amountCents,
        currency: "brl",
        captureMethod: "manual",
        allowedPaymentMethodTypes: ["card"],
        locale: "pt-BR",
        appearance: {
          theme: "night",
          variables: {
            colorPrimary: "#10b981",
            colorBackground: "#121214",
            borderRadius: "10px",
            fontSizeBase: "15px",
          },
        },
      }}
    >
      <CardFormInner {...props} />
    </Elements>
  )
}

function CardFormInner({ orderId, amountCents, initialError, onAuthorized }: StripeCardFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!stripe || !elements || submitting) return
    setSubmitting(true)
    setError(null)

    try {
      // Valida os campos no navegador (número incompleto, validade vencida…)
      // antes de gastar uma tentativa na rota.
      const { error: submitError } = await elements.submit()
      if (submitError) {
        setError(submitError.message ?? "Confira os dados do cartão.")
        return
      }

      // Sem `return_url` aqui: quem define para onde o banco devolve depois
      // do 3DS é o servidor, na confirmação — não um valor do navegador.
      const { error: tokenError, confirmationToken } = await stripe.createConfirmationToken({ elements })
      if (tokenError || !confirmationToken) {
        setError(tokenError?.message ?? "Não foi possível ler o cartão. Tente de novo.")
        return
      }

      const res = await fetch(`/api/store/orders/${orderId}/card-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationTokenId: confirmationToken.id }),
      })
      const data = (await res.json().catch(() => ({}))) as ConfirmResponse
      if (!res.ok) {
        setError(data.error ?? "O pagamento não foi aprovado. Tente de novo.")
        return
      }

      if (data.state === "requires_action" && data.clientSecret) {
        const { error: actionError, paymentIntent } = await stripe.handleNextAction({
          clientSecret: data.clientSecret,
        })
        if (actionError) {
          setError(
            actionError.code === "payment_intent_authentication_failure"
              ? "A autenticação do banco (3D Secure) não foi concluída. Tente de novo."
              : actionError.message ?? "O banco não aprovou a autenticação. Tente de novo."
          )
          return
        }
        if (paymentIntent && paymentIntent.status === "requires_payment_method") {
          setError("O banco recusou o pagamento depois da autenticação. Tente outro cartão ou pague com PIX.")
          return
        }
      }

      onAuthorized()
    } catch {
      setError("Falha de conexão ao processar o cartão. Confira a internet e tente de novo.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: "tabs",
          // Carteiras exigem domínio registrado no Stripe; ficam desligadas
          // até isso ser feito (senão o botão aparece e falha).
          wallets: { applePay: "never", googlePay: "never", link: "never" },
        }}
      />

      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full gap-2" size="lg" disabled={!stripe || !elements || submitting}>
        {submitting ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
        {submitting ? "Processando…" : `Pagar ${formatBRL(amountCents)}`}
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
        <Lock className="size-3" />
        Os dados do cartão vão criptografados direto para o Stripe e não ficam guardados na Sunano.
      </p>
    </form>
  )
}
