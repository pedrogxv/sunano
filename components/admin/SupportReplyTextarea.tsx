"use client"

import type { KeyboardEvent } from "react"

import { Textarea } from "@/components/ui/textarea"
import { isSubmitShortcut } from "@/lib/hooks/use-submit-shortcut"

/** Textarea da resposta do admin, com atalho Ctrl/⌘+Enter — o <form> ao redor continua sendo a Server Action da página, aqui só disparamos o submit nativo dele. */
export function SupportReplyTextarea() {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isSubmitShortcut(event)) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return <Textarea name="body" placeholder="Escreva sua resposta..." className="min-h-24" onKeyDown={handleKeyDown} required />
}
