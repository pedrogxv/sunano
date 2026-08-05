import "./globals.css"

import type { Metadata, Viewport } from "next"
import Script from "next/script"
import { Manrope, Space_Grotesk, Caveat } from "next/font/google"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/toaster"
import { LocaleProvider } from "@/components/providers/locale-context"
import { ThemeProvider } from "@/components/providers/theme-context"
import { SidebarProvider } from "@/components/providers/sidebar-context"
import { CartProvider } from "@/components/providers/cart-context"
import { PageHeaderProvider } from "@/components/providers/page-header-context"
import { AuthProvider } from "@/components/providers/auth-context"
import { LayoutShell } from "@/components/layout/LayoutShell"
import { CookieBanner } from "@/components/lgpd/CookieBanner"
import { OrganizationJsonLd } from "@/components/seo/OrganizationJsonLd"

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
})

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-caveat",
})

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://sunano.com.br"
const SITE_TITLE = "Sunano | Tierlist de Periféricos"
const SITE_DESCRIPTION = "A tierlist definitiva de periféricos gamers. Compare mouses, teclados, headsets e mais com filtros avancados e reviews detalhadas."

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s | Sunano" },
  description: SITE_DESCRIPTION,
  keywords: ["tierlist", "periféricos", "mouse", "teclado", "headset", "gaming", "review"],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Sunano",
    url: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: "/icon.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
  // O layout usa h-dvh/viewport unit no mobile; travar o zoom prejudicaria
  // acessibilidade, então apenas garantimos a escala inicial.
  viewportFit: "cover",
}

/** Aplica o tema salvo antes da primeira pintura. Sem isso o ThemeProvider só
 *  ajusta data-theme dentro de um useEffect, e quem usa tema claro vê um flash
 *  escuro a cada carregamento. */
const THEME_INIT_SCRIPT = `
(function() {
  try {
    var t = localStorage.getItem("sunano-theme");
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="bg-background" data-theme="dark" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <OrganizationJsonLd />
      </head>
      <body className={`${manrope.variable} ${spaceGrotesk.variable} ${caveat.variable} font-sans`}>
        <ThemeProvider>
          <LocaleProvider>
            <AuthProvider>
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
            </AuthProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
