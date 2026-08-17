"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { XIcon } from "lucide-react"

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { UserLoginForm } from "@/components/auth/UserLoginForm"
import { UserRegisterForm } from "@/components/auth/UserRegisterForm"
import { AuthModalGlow } from "@/components/auth/AuthModalGlow"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { cn } from "@/lib/utils"

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
      <DialogContent
        showCloseButton={false}
        className={cn(
          "max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden sm:max-w-md",
          "border-0 bg-gradient-to-b from-card via-card to-background p-0 ring-1 ring-foreground/10",
          "shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_60px_-15px_rgba(0,0,0,0.6)]"
        )}
      >
        <div className="relative px-6 pt-6 pb-5">
          <AuthModalGlow />

          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3 z-20">
              <XIcon />
              <span className="sr-only">Fechar</span>
            </Button>
          </DialogClose>

          <div className="mb-5 flex justify-center">
            <div className="relative grid w-64 grid-cols-2 rounded-full border border-border bg-muted/30 p-1 text-xs font-semibold">
              <motion.div
                className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-primary shadow-sm"
                initial={false}
                animate={{ x: mode === "login" ? 0 : "100%" }}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
              <button
                type="button"
                onClick={() => setMode("login")}
                className={cn(
                  "relative z-10 rounded-full px-4 py-1.5 text-center transition-colors",
                  mode === "login" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={cn(
                  "relative z-10 rounded-full px-4 py-1.5 text-center transition-colors",
                  mode === "register" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Criar conta
              </button>
            </div>
          </div>

          <DialogHeader className="text-center">
            <div className="relative overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <DialogTitle className="font-display text-xl">{TITLES[mode]}</DialogTitle>
                  <DialogDescription className="mx-auto">{DESCRIPTIONS[mode]}</DialogDescription>
                </motion.div>
              </AnimatePresence>
            </div>
          </DialogHeader>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              className="mt-5"
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
