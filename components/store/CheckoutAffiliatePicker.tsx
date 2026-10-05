"use client"

import { useEffect, useState } from "react"

import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import type { ProfileFrameIdentity } from "@/lib/profile-frames"
import { cn } from "@/lib/utils"

type CheckoutAffiliate = {
  code: string
  name: string
  avatarUrl: string | null
  frame: ProfileFrameIdentity | null
}

type AffiliatesResponse = {
  affiliates?: CheckoutAffiliate[]
  referredCode?: string | null
}

/**
 * "Apoie um afiliado" do checkout: só aparece para quem chegou pelo LINK de
 * um afiliado. Não há lista para escolher: a comissão vai para quem indicou,
 * e quem não veio de link não vê nada (a venda não tem afiliado).
 *
 * `value` começa `undefined` (ainda não carregou) e vira `string`/`null` só
 * quando há indicação; é o que diz à rota do checkout se houve escolha.
 * Dispensar o afiliado grava `null`, e a pessoa pode reativar na mesma tela.
 */
export function CheckoutAffiliatePicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null | undefined
  onChange: (code: string | null) => void
  disabled?: boolean
}) {
  const [referred, setReferred] = useState<CheckoutAffiliate | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/store/checkout/affiliates")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AffiliatesResponse | null) => {
        if (cancelled || !data?.referredCode) return
        const match = data.affiliates?.find((affiliate) => affiliate.code === data.referredCode)
        if (!match) return
        setReferred(match)
        onChange(match.code)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // Só na montagem: refazer a cada `onChange` novo sobrescreveria a
    // escolha da pessoa com a do link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!referred) return null

  const active = value === referred.code

  return (
    <div
      className="checkout-affiliate-card relative rounded-xl border p-4"
      data-selected={active ? "true" : undefined}
    >
      <div className="flex items-center gap-3">
        <ProfileAvatar
          name={referred.name}
          avatarUrl={referred.avatarUrl}
          frame={referred.frame}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">
            {active ? `Você está apoiando ${referred.name}` : `Apoiar ${referred.name}?`}
          </p>
          <p className="text-xs text-muted-foreground">
            Você chegou pelo link deste afiliado. A comissão sai da loja e o seu preço não muda.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(active ? null : referred.code)}
          disabled={disabled}
          className={cn(
            "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60",
            active
              ? "border-border/60 text-muted-foreground hover:border-red-500/40 hover:text-red-400"
              : "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
          )}
        >
          {active ? "Remover" : "Apoiar"}
        </button>
      </div>
    </div>
  )
}
