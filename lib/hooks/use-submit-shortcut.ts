import { useEffect, useState, type KeyboardEvent } from "react"

/**
 * No Mac o atalho de submit é ⌘+Enter; em todo o resto (Windows/Linux) é Ctrl+Enter.
 * `navigator.platform` só existe no client, então o label começa como "Ctrl" (SSR-safe)
 * e corrige pra "⌘" depois do mount se detectar Mac.
 */
export function useSubmitShortcutLabel() {
  const [label, setLabel] = useState("Ctrl")

  useEffect(() => {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? navigator.userAgent)
    setLabel(isMac ? "⌘" : "Ctrl")
  }, [])

  return label
}

export function isSubmitShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
  return (event.metaKey || event.ctrlKey) && event.key === "Enter"
}
