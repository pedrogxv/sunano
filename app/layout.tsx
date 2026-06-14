import "./globals.css"

import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/toaster"
import { LocaleProvider } from "@/components/providers/locale-context"
import { ThemeProvider } from "@/components/providers/theme-context"
import { SidebarProvider } from "@/components/providers/sidebar-context"
import { CartProvider } from "@/components/providers/cart-context"
import { PageHeaderProvider } from "@/components/providers/page-header-context"
import { LayoutShell } from "@/components/layout/LayoutShell"
import { CookieBanner } from "@/components/lgpd/CookieBanner"

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
                <PageHeaderProvider>
                  <TooltipProvider delayDuration={200}>
                    <LayoutShell>{children}</LayoutShell>
                    <Toaster />
                    <CookieBanner />
                  </TooltipProvider>
                </PageHeaderProvider>
              </CartProvider>
            </SidebarProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
