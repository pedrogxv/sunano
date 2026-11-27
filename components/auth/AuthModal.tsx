"use client"

import { useState } from "react"
import { LogIn, UserPlus } from "lucide-react"

import { AdaptiveDialog } from "@/components/ui/adaptive-dialog"
import { UserLoginForm } from "@/components/auth/UserLoginForm"
import { UserRegisterForm } from "@/components/auth/UserRegisterForm"
import { useAuthModal, type AuthModalMode } from "@/components/providers/auth-modal-context"
import { cn } from "@/lib/utils"

/** Cabeçalho de cada aba. A ordem das chaves é a ordem das abas. */
const MODES: Record<AuthModalMode, { tab: string; title: string; description: string; icon: React.ReactNode }> = {
  login: {
    tab: "Entrar",
    title: "Bem-vindo de volta",
    description: "Entre para comentar no fórum, juntar Aura e acompanhar seus pedidos",
    icon: <LogIn />,
  },
  register: {
    tab: "Criar conta",
    title: "Crie sua conta",
    description: "Leva menos de um minuto, e com Google ou Discord é um clique",
    icon: <UserPlus />,
  },
}

const MODE_KEYS = Object.keys(MODES) as AuthModalMode[]

/**
 * Modal de login/cadastro global, sobre o `AdaptiveDialog` (regra do
 * AGENTS.md): no desktop nasce do botão clicado, no celular vira gaveta com
 * o form ao alcance do polegar. Os campos, avisos e botões são os mesmos das
 * páginas /login e /register (`auth-form-ui`), então modal e página não
 * divergem mais.
 *
 * Só é buscado do servidor quando alguém realmente abre — ver o
 * `dynamic(..., { ssr: false })` no LayoutShell, que só monta este componente
 * depois do primeiro `isOpen === true` — então páginas que nunca usam auth
 * (loja, blog, fórum público) não pagam o custo do bundle de `@supabase/ssr`
 * que os forms puxam. Sem framer-motion: a troca de aba e o indicador são
 * CSS, e o chunk ficou só com os forms.
 */
export function AuthModal() {
  const { isOpen, mode: initialMode, next, close } = useAuthModal()
  const [mode, setMode] = useState(initialMode)
  // Rastreia o `isOpen` do render anterior (padrão React de "adjusting state
  // when a prop changes", só que via state em vez de ref, já que refs não
  // podem ser lidas/escritas durante a renderização neste projeto).
  const [wasOpen, setWasOpen] = useState(isOpen)

  // Sincroniza a aba interna com o modo pedido por `openLogin`/`openRegister`
  // apenas na TRANSIÇÃO fechado→aberto — sem isso, abrir "Cadastre-se" depois
  // de já ter aberto "Entrar" uma vez mostraria a última aba usada. Comparar
  // contra `initialMode` a cada render (em vez de rastrear a transição)
  // reverteria a troca de aba feita por dentro do próprio modal, porque
  // `initialMode` não muda enquanto o modal permanece aberto.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen && mode !== initialMode) {
      setMode(initialMode)
    }
  }

  function handleLoginSuccess(mfaNext?: string) {
    close()
    if (mfaNext) {
      window.location.href = mfaNext
    }
  }

  const current = MODES[mode]
  const index = MODE_KEYS.indexOf(mode)

  return (
    <AdaptiveDialog
      open={isOpen}
      onOpenChange={(open) => !open && close()}
      size="md"
      tone="violet"
      icon={current.icon}
      title={current.title}
      description={current.description}
    >
      {/* Abas: o indicador desliza por `transform` (compositor), sem JS de animação. */}
      <div role="tablist" aria-label="Entrar ou criar conta" className="relative grid grid-cols-2 rounded-xl bg-muted/40 p-1">
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-background shadow-sm ring-1 ring-white/10 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(${index * 100}%)` }}
        />
        {MODE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={cn(
              "relative z-10 h-9 rounded-lg text-[13px] font-semibold transition-colors",
              mode === key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {MODES[key].tab}
          </button>
        ))}
      </div>

      {/* `key` remonta o form na troca e a entrada vem do lado da aba escolhida. */}
      <div
        key={mode}
        role="tabpanel"
        className={cn(
          "animate-in fade-in-0 duration-300 ease-out motion-reduce:animate-none",
          mode === "register" ? "slide-in-from-right-3" : "slide-in-from-left-3"
        )}
      >
        {mode === "login" ? (
          <UserLoginForm
            embedded
            next={next}
            onSuccess={handleLoginSuccess}
            onSwitchToRegister={() => setMode("register")}
          />
        ) : (
          <UserRegisterForm embedded next={next} onSwitchToLogin={() => setMode("login")} />
        )}
      </div>
    </AdaptiveDialog>
  )
}
