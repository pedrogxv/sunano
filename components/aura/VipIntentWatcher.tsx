"use client"

import dynamic from "next/dynamic"
import { useState } from "react"

import { useAuthUser } from "@/components/providers/auth-context"
import { consumeVipIntent, forgetVipIntent } from "@/lib/client/vip-intent"

// Mesmo motivo do AuthModal no LayoutShell: o popup do VIP puxa formulário de
// cobrança, máscaras e o QR do PIX. Só é buscado quando a intenção de fato
// existe — o watcher em si não pesa nada no bundle inicial.
const VipUpsellModal = dynamic(
  () => import("@/components/aura/VipUpsellModal").then((m) => m.VipUpsellModal),
  { ssr: false }
)

/**
 * Reabre o popup do VIP depois que a pessoa termina o login/cadastro que ela
 * começou POR CAUSA do VIP.
 *
 * Mora no layout, e não em cada tela que oferece o VIP, porque o login pode
 * terminar em OUTRA página: o OAuth sai do site e volta em
 * `/auth/callback?next=…`, então quem abriu o popup na tierlist pode
 * reaparecer no fórum. Um watcher global é o único ponto que enxerga os dois
 * finais possíveis do login (ver `lib/client/vip-intent.ts`).
 *
 * A intenção é CONSUMIDA na primeira leitura com sessão confirmada, então o
 * modal volta uma vez só — fechá-lo não o traz de novo na próxima navegação.
 */
export function VipIntentWatcher() {
  const { user, loading } = useAuthUser()
  const [open, setOpen] = useState(false)

  // `loading` (e não `pending`) é o sinal certo aqui: abrir um popup de
  // cobrança é uma decisão que não pode errar, e o snapshot do `localStorage`
  // é só um palpite. Espera a palavra do servidor.
  //
  // Sem sessão a intenção FICA guardada: é exatamente o estado de quem está
  // com o modal de login aberto neste instante. Quem desistir leva o prazo do
  // `MAX_AGE_MS` ou fecha a aba, e nos dois casos ela morre sozinha.
  const hasSession = !loading && user != null

  // Rastreia o valor do render anterior (o mesmo padrão de "adjusting state
  // when a prop changes" que o AuthModal usa, via state em vez de ref): a
  // leitura do `sessionStorage` só pode acontecer na TRANSIÇÃO para "tem
  // sessão". Refeita a cada render, ela consumiria a intenção antes da
  // resposta do servidor ou reabriria o modal que o usuário acabou de fechar.
  const [hadSession, setHadSession] = useState(hasSession)
  if (hasSession !== hadSession) {
    setHadSession(hasSession)
    if (hasSession) {
      if (user.vip.isVip) {
        // Já virou VIP no caminho (ex.: ativou com Aura por outra tela): não
        // há oferta a mostrar, mas a intenção precisa sair do storage do
        // mesmo jeito, senão reabre num login futuro.
        forgetVipIntent()
      } else if (consumeVipIntent()) {
        setOpen(true)
      }
    }
  }

  if (!open) return null

  return <VipUpsellModal open={open} onOpenChange={setOpen} />
}
