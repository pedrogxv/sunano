"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { UserLoginForm } from "@/components/auth/UserLoginForm"
import { UserRegisterForm } from "@/components/auth/UserRegisterForm"
import { useAuthModal } from "@/components/providers/auth-modal-context"

const TITLES = {
  login: "Entrar",
  register: "Criar conta",
}

const DESCRIPTIONS = {
  login: "Entre para continuar.",
  register: "Leva menos de um minuto.",
}

/**
 * Modal de login/cadastro global. Só é buscado do servidor quando alguém
 * realmente abre — ver o `dynamic(..., { ssr: false })` no LayoutShell, que
 * só monta este componente depois do primeiro `isOpen === true` — então
 * páginas que nunca usam auth (loja, blog, fórum público) não pagam o custo
 * do bundle de `@supabase/ssr` que os forms puxam.
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

  function handleOpenChange(open: boolean) {
    if (!open) close()
  }

  function handleLoginSuccess(mfaNext?: string) {
    close()
    if (mfaNext) {
      window.location.href = mfaNext
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <div className="relative overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <DialogTitle>{TITLES[mode]}</DialogTitle>
                <DialogDescription>{DESCRIPTIONS[mode]}</DialogDescription>
              </motion.div>
            </AnimatePresence>
          </div>
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, x: mode === "register" ? 16 : -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: mode === "register" ? -16 : 16 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
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
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
