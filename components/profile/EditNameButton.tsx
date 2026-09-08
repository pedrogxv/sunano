"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"

import { profilePath } from "@/lib/profile-name"
import { useAuthUser } from "@/components/providers/auth-context"
import { ChangeDisplayNameModal } from "./ChangeDisplayNameModal"

interface EditNameButtonProps {
  currentName: string
}

/**
 * Único ponto de interatividade no header do "meu perfil" público —
 * `InfoBasica`/`ProfileShowcase` continuam Server Components puros, só este
 * botão isolado é client, mesmo racional de `FollowButton` ao lado dele.
 */
export function EditNameButton({ currentName }: EditNameButtonProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  // `router.refresh()` refaz os Server Components, mas o nome na topbar vem do
  // AuthProvider (client) — que não escuta nada disso. Sem este refresh, o
  // menu da conta continua com o nome antigo.
  const { refresh: refreshAuthUser } = useAuthUser()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Trocar nome"
        className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-orange-500/40 hover:text-orange-400"
      >
        <Pencil className="size-3" />
      </button>
      <ChangeDisplayNameModal
        open={open}
        onOpenChange={setOpen}
        currentName={currentName}
        onChanged={(_newName, newSlug) => {
          if (newSlug) {
            router.replace(profilePath(newSlug))
          }
          router.refresh()
          refreshAuthUser()
        }}
      />
    </>
  )
}
