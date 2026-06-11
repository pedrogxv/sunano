"use client"

import { useTheme } from "@/components/providers/theme-context"

export function GripArchitectureImage() {
  const { theme } = useTheme()
  const isLight = theme === "light"

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt="Arquitetura de pegada"
      src={isLight ? "/images/mascot/arquitetura-white.png" : "/images/mascot/arquitetura-black.png"}
      className="w-full rounded-lg object-contain"
    />
  )
}
