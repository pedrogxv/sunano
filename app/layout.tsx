import "./globals.css"

import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import { TooltipProvider } from "@/components/ui/tooltip"
import { LocaleProvider } from "@/lib/locale-context"
import { ThemeProvider } from "@/lib/theme-context"
import { SidebarProvider } from "@/lib/sidebar-context"
import { CartProvider } from "@/lib/cart-context"
import { LayoutShell } from "@/components/layout/LayoutShell"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
})

export const metadata: Metadata = {
  title: "Sunano | Tierlist de Periféricos",
  description: "A tierlist definitiva de periféricos gamers. Compare mouses, teclados, headsets e mais com filtros avancados e reviews detalhadas.",
  keywords: ["tierlist", "periféricos", "mouse", "teclado", "headset", "gaming", "review"],
}

export const viewport: Viewport = {
  themeColor: "#0a0d14",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="bg-background" data-theme="midnight" suppressHydrationWarning>
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans`}>
        <ThemeProvider>
          <LocaleProvider>
            <SidebarProvider>
              <CartProvider>
                <TooltipProvider delayDuration={200}>
                  <LayoutShell>{children}</LayoutShell>
                </TooltipProvider>
              </CartProvider>
            </SidebarProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
