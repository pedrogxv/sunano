"use client"

import { createContext, useContext } from "react"

import type { StoreCommerceBarConfig } from "@/lib/store-commerce-bar"

type StoreCommerceBarContextValue = {
  config: StoreCommerceBarConfig
  /** Relógio do servidor na renderização: a primeira pintura decide o modo com ele, sem divergir da hidratação. */
  serverNow: number
}

const StoreCommerceBarContext = createContext<StoreCommerceBarContextValue | null>(null)

/**
 * Entrega a configuração da barra comercial a toda página de /loja. Quem lê
 * do banco é o `app/loja/layout.tsx`; o menu da Loja (StoreCategoryNav) só
 * consome daqui, sem cada página precisar buscar e repassar por props.
 */
export function StoreCommerceBarProvider({
  config,
  serverNow,
  children,
}: StoreCommerceBarContextValue & { children: React.ReactNode }) {
  return (
    <StoreCommerceBarContext.Provider value={{ config, serverNow }}>{children}</StoreCommerceBarContext.Provider>
  )
}

/** `null` fora de /loja (ex.: checkout): quem usa simplesmente não desenha a barra. */
export function useStoreCommerceBar(): StoreCommerceBarContextValue | null {
  return useContext(StoreCommerceBarContext)
}
