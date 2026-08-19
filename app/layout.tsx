import "./globals.css"

import type { Metadata, Viewport } from "next"
import { Manrope, Space_Grotesk, Caveat } from "next/font/google"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/toaster"
import { LocaleProvider } from "@/components/providers/locale-context"
import { SidebarProvider } from "@/components/providers/sidebar-context"
import { CartProvider } from "@/components/providers/cart-context"
import { PageHeaderProvider } from "@/components/providers/page-header-context"
import { AuthProvider } from "@/components/providers/auth-context"
import { AuthModalProvider } from "@/components/providers/auth-modal-context"
import { SavedPostsProvider } from "@/components/providers/saved-posts-context"
import { AuthHashErrorListener } from "@/components/auth/AuthHashErrorListener"
import { LayoutShell } from "@/components/layout/LayoutShell"
import { CookieBanner } from "@/components/lgpd/CookieBanner"
import { OrganizationJsonLd } from "@/components/seo/OrganizationJsonLd"
import { SITE_URL } from "@/lib/site-url"

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

const SITE_TITLE = "Sunano | Tierlist de Periféricos"
const SITE_DESCRIPTION = "Mouse, teclado ou headset? Veja a tierlist com nota de verdade, reviews reais da comunidade e curadoria do Sunano antes de comprar."

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
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  // O layout usa h-dvh/viewport unit no mobile; travar o zoom prejudicaria
  // acessibilidade, então apenas garantimos a escala inicial.
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="bg-background" data-theme="dark" suppressHydrationWarning>
      <head>
        <OrganizationJsonLd />
      </head>
      <body className={`${manrope.variable} ${spaceGrotesk.variable} ${caveat.variable} font-sans`}>
        <LocaleProvider>
          <AuthProvider>
            <AuthModalProvider>
              <SavedPostsProvider>
                <SidebarProvider>
                  <CartProvider>
                    <PageHeaderProvider>
                      <TooltipProvider delayDuration={200}>
                        <LayoutShell>{children}</LayoutShell>
                        <Toaster />
                        <AuthHashErrorListener />
                        <CookieBanner />
                      </TooltipProvider>
                    </PageHeaderProvider>
                  </CartProvider>
                </SidebarProvider>
              </SavedPostsProvider>
            </AuthModalProvider>
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  )
}
