import { useEffect, useState } from "react"

/** Atrasa a propagação de `value` em `delayMs` — usado para não disparar um
 * fetch a cada tecla digitada em campos de busca. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
