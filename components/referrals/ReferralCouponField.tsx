"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Gift, Loader2, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  REFERRAL_CODE_MAX_LENGTH,
  REFERRAL_QUERY_PARAM,
  REFERRAL_REWARD_DIRECT,
  normalizeReferralCode,
} from "@/lib/referral-code"
import { cn } from "@/lib/utils"

type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "valid"; referrerName: string }
  | { kind: "invalid"; message: string }

/**
 * Campo "Cupom de Indicação" do cadastro.
 *
 * Existe porque nem todo mundo chega pelo link: o cookie do proxy cobre quem
 * clicou, e este campo cobre quem recebeu o código por mensagem, vídeo ou de
 * boca. Como cada pessoa só pode ser indicada UMA vez (a PK de `referrals`),
 * não há segunda chance depois do cadastro — daí a conferência ao vivo, que
 * mostra o nome de quem indicou antes de a conta existir.
 *
 * `defaultValue` vem do servidor quando o cookie já está gravado.
 */
export function ReferralCouponField({ defaultValue = "" }: { defaultValue?: string }) {
  // Inicialização preguiçosa em vez de um efeito que chama setCode: a prop do
  // servidor tem prioridade e, sem ela, `?convite=` da URL cobre quem acabou
  // de chegar pelo link (e o caso do cookie não ter pego — aba anônima,
  // navegador bloqueando). Ler no inicializador evita o render extra e o
  // setState-dentro-de-efeito que o lint (com razão) reprova.
  const [code, setCode] = useState(() => {
    if (defaultValue) return defaultValue
    if (typeof window === "undefined") return ""
    const fromUrl = new URLSearchParams(window.location.search).get(REFERRAL_QUERY_PARAM)
    return fromUrl ? normalizeReferralCode(fromUrl) : ""
  })
  const [checked, setChecked] = useState<CheckState | null>(null)
  // Descarta respostas fora de ordem: sem isso a checagem de um código
  // digitado antes pode chegar depois e sobrescrever o resultado do atual.
  const requestRef = useRef(0)

  const normalizedCode = normalizeReferralCode(code)
  // Campo vazio é sempre "idle" — estado DERIVADO, não guardado. Guardá-lo
  // exigiria um setState no efeito só para voltar ao início quando a pessoa
  // apaga o que digitou.
  const state: CheckState = normalizedCode ? (checked ?? { kind: "checking" }) : { kind: "idle" }

  // Busca o cupom do cookie `sn_inv_ref` quando não veio nem por prop nem pela
  // URL. O cookie é httpOnly, então só o servidor consegue lê-lo — este é o
  // caminho do AuthModal, que abre em qualquer página e não recebe a prop.
  useEffect(() => {
    if (defaultValue || code) return

    let active = true
    fetch("/api/indicacoes/cupom-check")
      .then((res) => res.json())
      .then((data) => {
        // `active` evita o setState depois de desmontar (o modal fecha rápido).
        // Só preenche se o cookie tinha um cupom que de fato existe.
        if (active && data?.valid && data?.code) setCode(data.code)
      })
      .catch(() => {})

    return () => {
      active = false
    }
    // Só na montagem: se rodasse a cada `code`, apagar o campo faria o cupom
    // do cookie voltar sozinho e a pessoa não conseguiria removê-lo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue])

  useEffect(() => {
    const normalized = normalizeReferralCode(code)
    if (!normalized) return

    const requestId = ++requestRef.current
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/indicacoes/cupom-check?code=${encodeURIComponent(normalized)}`)
        const data = await res.json()
        if (requestId !== requestRef.current) return

        if (data?.valid && data?.referrerName) {
          setChecked({ kind: "valid", referrerName: data.referrerName })
        } else {
          setChecked({ kind: "invalid", message: data?.error ?? "Cupom não encontrado." })
        }
      } catch {
        if (requestId !== requestRef.current) return
        // Falha de rede não é cupom inválido: some com o aviso em vez de
        // acusar erro de digitação que pode não existir. O cadastro segue —
        // o cupom é validado de novo no servidor.
        setChecked({ kind: "idle" })
      }
    }, 450)

    return () => clearTimeout(timer)
  }, [code])

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground" htmlFor="referral_code">
        <Gift className="size-3.5 text-primary" />
        Cupom de Indicação
        <span className="font-normal text-muted-foreground">(opcional)</span>
      </label>
      <div className="relative">
        <Input
          id="referral_code"
          name="referral_code"
          type="text"
          autoComplete="off"
          placeholder="Digite o cupom de quem te indicou"
          maxLength={REFERRAL_CODE_MAX_LENGTH}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase())
            // Limpa o veredito anterior junto com a digitação: sem isso o
            // "válido" do cupom antigo fica na tela enquanto o novo é
            // conferido, e a pessoa vê um check verde para um código que
            // ainda nem foi checado.
            setChecked(null)
          }}
          className={cn(
            "border-border bg-muted/20 pr-9 uppercase placeholder:normal-case",
            state.kind === "valid" && "border-green-500/50",
            state.kind === "invalid" && "border-amber-500/50"
          )}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {state.kind === "checking" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {state.kind === "valid" && <Check className="size-4 text-green-500" />}
          {state.kind === "invalid" && <X className="size-4 text-amber-500" />}
        </span>
      </div>

      {state.kind === "valid" && (
        <p className="text-xs text-green-600 dark:text-green-400">
          Você foi indicado por <strong>{state.referrerName}</strong>. Ele ganha{" "}
          {REFERRAL_REWARD_DIRECT} de Aura quando você conectar uma conta social ou fizer 3 dias de
          ofensiva.
        </p>
      )}
      {state.kind === "invalid" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{state.message}</p>
      )}
      {state.kind === "idle" && !code && (
        <p className="text-xs text-muted-foreground">
          Tem um cupom de indicação? Digite aqui — dá pra usar só no cadastro.
        </p>
      )}
    </div>
  )
}
