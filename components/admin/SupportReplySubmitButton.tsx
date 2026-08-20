"use client"

import { useFormStatus } from "react-dom"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useSubmitShortcutLabel } from "@/lib/hooks/use-submit-shortcut"

export function SupportReplySubmitButton() {
  const { pending } = useFormStatus()
  const shortcutLabel = useSubmitShortcutLabel()

  return (
    <Button type="submit" size="sm" className="gap-2" disabled={pending}>
      {pending && <Loader2 className="size-3.5 animate-spin" />}
      Responder
      {!pending && (
        <kbd className="rounded border border-primary-foreground/30 bg-primary-foreground/10 px-1.5 py-0.5 text-[10px] font-medium leading-none">
          {shortcutLabel}+Enter
        </kbd>
      )}
    </Button>
  )
}
