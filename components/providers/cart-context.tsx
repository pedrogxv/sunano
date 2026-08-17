"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

export interface CartItem {
  productId: string
  variantId: string | null
  variantLabel: string | null
  variantColor: string | null
  variantIcon: string | null
  slug: string
  name: string
  priceCents: number
  quantity: number
  image: string | null
  /** `null` = sem controle de estoque (nunca esgota). */
  stock: number | null
  type: "store" | "bazaar"
  condition: "new" | "used" | "opened"
}

interface CartContextValue {
  items: CartItem[]
  count: number
  add: (item: Omit<CartItem, "quantity">) => void
  remove: (productId: string, variantId: string | null) => void
  increment: (productId: string, variantId: string | null) => void
  decrement: (productId: string, variantId: string | null) => void
  clear: () => void
  isOpen: boolean
  setOpen: (open: boolean) => void
}

const CartContext = createContext<CartContextValue | null>(null)

const STORAGE_KEY = "sunano_cart"

function isSameLine(item: CartItem, productId: string, variantId: string | null) {
  return item.productId === productId && item.variantId === variantId
}

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false
  const i = value as Record<string, unknown>
  return (
    typeof i.productId === "string" &&
    (i.variantId === undefined || i.variantId === null || typeof i.variantId === "string") &&
    (i.variantLabel === undefined || i.variantLabel === null || typeof i.variantLabel === "string") &&
    (i.variantColor === undefined || i.variantColor === null || typeof i.variantColor === "string") &&
    (i.variantIcon === undefined || i.variantIcon === null || typeof i.variantIcon === "string") &&
    typeof i.slug === "string" &&
    typeof i.name === "string" &&
    typeof i.priceCents === "number" &&
    typeof i.quantity === "number" &&
    i.quantity > 0 &&
    (i.stock === null || typeof i.stock === "number") &&
    (i.image === null || typeof i.image === "string") &&
    (i.type === "store" || i.type === "bazaar") &&
    (i.condition === "new" || i.condition === "used" || i.condition === "opened")
  )
}

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isCartItem)
      .map((i) => ({
        ...i,
        variantId: i.variantId ?? null,
        variantLabel: i.variantLabel ?? null,
        variantColor: i.variantColor ?? null,
        variantIcon: i.variantIcon ?? null,
      }))
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isOpen, setOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setItems(loadCart())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    }
  }, [items, hydrated])

  // Mantém o carrinho em sincronia entre abas — ex.: usuário adiciona um
  // produto em outra aba enquanto a gaveta está aberta nesta.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setItems(loadCart())
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const add = useCallback((item: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const existing = prev.find((i) => isSameLine(i, item.productId, item.variantId))
      if (existing) {
        // Respeita o limite de estoque — stock null = sem controle, nunca trava aqui
        // (o limite diário para esses casos é aplicado no checkout, não no cliente).
        const nextQty = item.stock === null ? existing.quantity + 1 : Math.min(existing.quantity + 1, item.stock)
        return prev.map((i) =>
          isSameLine(i, item.productId, item.variantId) ? { ...i, quantity: nextQty } : i
        )
      }
      return [...prev, { ...item, quantity: 1 }]
    })
  }, [])

  const remove = useCallback((productId: string, variantId: string | null) => {
    setItems((prev) => prev.filter((i) => !isSameLine(i, productId, variantId)))
  }, [])

  const increment = useCallback((productId: string, variantId: string | null) => {
    setItems((prev) =>
      prev.map((i) =>
        isSameLine(i, productId, variantId) && (i.stock === null || i.quantity < i.stock)
          ? { ...i, quantity: i.quantity + 1 }
          : i
      )
    )
  }, [])

  const decrement = useCallback((productId: string, variantId: string | null) => {
    setItems((prev) => {
      const item = prev.find((i) => isSameLine(i, productId, variantId))
      if (!item) return prev
      if (item.quantity <= 1) return prev.filter((i) => !isSameLine(i, productId, variantId))
      return prev.map((i) =>
        isSameLine(i, productId, variantId) ? { ...i, quantity: i.quantity - 1 } : i
      )
    })
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const count = items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <CartContext.Provider value={{ items, count, add, remove, increment, decrement, clear, isOpen, setOpen }}>
      {children}
    </CartContext.Provider>
  )
}

const CART_FALLBACK: CartContextValue = {
  items: [],
  count: 0,
  add: () => {},
  remove: () => {},
  increment: () => {},
  decrement: () => {},
  clear: () => {},
  isOpen: false,
  setOpen: () => {},
}


export function useCart(): CartContextValue {
  return useContext(CartContext) ?? CART_FALLBACK
}
