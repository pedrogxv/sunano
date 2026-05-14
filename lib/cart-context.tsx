"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

export interface CartItem {
  productId: string
  slug: string
  name: string
  priceCents: number
  quantity: number
  image: string | null
  stock: number
  type: "store" | "bazaar"
}

interface CartContextValue {
  items: CartItem[]
  count: number
  add: (item: Omit<CartItem, "quantity">) => void
  remove: (productId: string) => void
  increment: (productId: string) => void
  decrement: (productId: string) => void
  clear: () => void
  isOpen: boolean
  setOpen: (open: boolean) => void
}

const CartContext = createContext<CartContextValue | null>(null)

const STORAGE_KEY = "sunano_cart"

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CartItem[]) : []
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

  const add = useCallback((item: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId)
      if (existing) {
        // Respect stock limit
        const nextQty = Math.min(existing.quantity + 1, item.stock)
        return prev.map((i) =>
          i.productId === item.productId ? { ...i, quantity: nextQty } : i
        )
      }
      return [...prev, { ...item, quantity: 1 }]
    })
  }, [])

  const remove = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId))
  }, [])

  const increment = useCallback((productId: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.productId === productId && i.quantity < i.stock
          ? { ...i, quantity: i.quantity + 1 }
          : i
      )
    )
  }, [])

  const decrement = useCallback((productId: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.productId === productId)
      if (!item) return prev
      if (item.quantity <= 1) return prev.filter((i) => i.productId !== productId)
      return prev.map((i) =>
        i.productId === productId ? { ...i, quantity: i.quantity - 1 } : i
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
