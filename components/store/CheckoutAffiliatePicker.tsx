"use client"

import { useEffect, useState } from "react"
import { Check, ChevronsUpDown, HeartHandshake, X } from "lucide-react"

import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
 * "Apoie um afiliado" do checkout: a pessoa escolhe quem recebe a comissão
 * desta compra, no estilo do "código de criador" de loja de jogo.
 *
 * `value` começa `undefined` (ainda não carregou) e só vira `string`/`null`
 * quando a lista chega; é o que diz à rota do checkout se houve escolha. Sem
 * lista (falha ou nenhum afiliado), continua `undefined` e a venda segue a
 * regra antiga do cookie do link.
 *
 * A borda gira sem parar enquanto NINGUÉM foi escolhido: é o campo que a
 * pessoa esquece, e esquecer aqui custa a comissão de quem a trouxe. Depois
 * da escolha a volta desacelera, para não disputar atenção com o botão de
 * pagar logo abaixo.
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
  const [affiliates, setAffiliates] = useState<CheckoutAffiliate[] | null>(null)
  const [referredCode, setReferredCode] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/store/checkout/affiliates")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AffiliatesResponse | null) => {
        if (cancelled || !data?.affiliates?.length) return
        setAffiliates(data.affiliates)
        setReferredCode(data.referredCode ?? null)
        // Quem chegou pelo link de um afiliado já abre com ele escolhido.
        onChange(data.referredCode ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // Só na montagem: refazer a cada `onChange` novo sobrescreveria a
    // escolha da pessoa com a do link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!affiliates) return null

  const selected = affiliates.find((affiliate) => affiliate.code === value) ?? null

  return (
    <div
      className="checkout-affiliate-card relative rounded-xl border p-4"
      data-selected={selected ? "true" : undefined}
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
          <HeartHandshake className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">Apoie um afiliado</p>
          <p className="text-xs text-muted-foreground">
            Escolha quem você quer ajudar com esta compra. A comissão sai da loja e o seu preço não
            muda.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                "flex min-h-12 w-full items-center gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-left transition-colors hover:border-emerald-500/50 disabled:opacity-60",
                selected && "border-emerald-500/40"
              )}
            >
              {selected ? (
                <>
                  <ProfileAvatar
                    name={selected.name}
                    avatarUrl={selected.avatarUrl}
                    frame={selected.frame}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {selected.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      Código {selected.code}
                      {selected.code === referredCode && " · você chegou pelo link deste afiliado"}
                    </span>
                  </span>
                </>
              ) : (
                <span className="flex-1 text-sm text-muted-foreground">Escolha quem você quer ajudar</span>
              )}
              <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-(--radix-popover-trigger-width) flex-col gap-0 p-0">
            <Command>
              <CommandInput placeholder="Buscar por nome ou código..." />
              <CommandList>
                <CommandEmpty>Nenhum afiliado encontrado.</CommandEmpty>
                <CommandGroup>
                  {affiliates.map((affiliate) => (
                    <CommandItem
                      key={affiliate.code}
                      value={`${affiliate.name} ${affiliate.code}`}
                      onSelect={() => {
                        onChange(affiliate.code)
                        setOpen(false)
                      }}
                      className="gap-3"
                    >
                      <ProfileAvatar
                        name={affiliate.name}
                        avatarUrl={affiliate.avatarUrl}
                        frame={affiliate.frame}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{affiliate.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {affiliate.code}
                        </span>
                      </span>
                      {affiliate.code === value && <Check className="size-4 shrink-0 text-emerald-400" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {selected && (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label="Não apoiar nenhum afiliado"
            title="Não apoiar nenhum afiliado"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:border-red-500/40 hover:text-red-400"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
