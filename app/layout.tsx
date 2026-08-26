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
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, SITE_NAME, ogImageUrl } from "@/lib/seo"

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
  applicationName: SITE_NAME,
  keywords: ["tierlist", "periféricos", "mouse", "teclado", "headset", "gaming", "review"],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  // Sem isso o crawler do X/Facebook pode transformar "0800 123" ou uma data
  // em link e quebrar o texto do card.
  formatDetection: { telephone: false, date: false, address: false, email: false },
  // Padrão do Google para preview rico: sem os `max-*` ele limita a descrição
  // e pode exibir a página sem thumbnail na busca por imagens.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: SITE_NAME,
    url: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // Card gerado em 1200×630 — ver app/api/og/route.tsx. O antigo `/icon.png`
    // era 512×512 (1:1) e aparecia recortado ou era descartado pelo X.
    images: [
      {
        url: ogImageUrl({ title: "Tierlist de Periféricos", subtitle: SITE_DESCRIPTION }),
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
        alt: SITE_TITLE,
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [ogImageUrl({ title: "Tierlist de Periféricos", subtitle: SITE_DESCRIPTION })],
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
