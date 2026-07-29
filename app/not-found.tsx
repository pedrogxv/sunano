"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, MessageSquare, Mouse, Newspaper, Trophy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SunanoLogo } from "@/components/ui/SunanoLogo"
import { useT } from "@/lib/use-t"

const QUICK_LINKS = [
  { href: "/perifericos", icon: Mouse, key: "linkPeripherals" as const },
  { href: "/tierlist", icon: Trophy, key: "linkTierlist" as const },
  { href: "/blog", icon: Newspaper, key: "linkBlog" as const },
  { href: "/forum", icon: MessageSquare, key: "linkForum" as const },
]

export default function NotFound() {
  const t = useT()
  const e = t.errorPages
  const pathname = usePathname()
  const router = useRouter()
  const isAdmin = pathname?.startsWith("/admin") ?? false

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-12 text-center">
      <SunanoLogo showText className="mb-6" />

      <div className="relative mb-6 flex size-44 items-center justify-center rounded-[2.5rem] bg-black shadow-2xl ring-1 ring-white/10 sm:size-52">
        <div className="pointer-events-none absolute -inset-8 -z-10 rounded-full bg-primary/20 blur-3xl" />
        <Image
          src="/images/mascot/mascot-digging.png"
          alt="Mascote do Sunano cavando, procurando a página perdida"
          width={280}
          height={280}
          priority
          className="size-36 object-contain sm:size-44"
        />
      </div>

      <p className="font-display text-6xl font-bold tracking-tight text-foreground sm:text-7xl">404</p>
      <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{e.notFoundTitle}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground sm:text-base">{e.notFoundBody}</p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href={isAdmin ? "/admin" : "/"}>{isAdmin ? e.backDashboard : e.backHome}</Link>
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
          {e.goBack}
        </Button>
      </div>

      {!isAdmin && (
        <div className="mt-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
            {e.quickLinks}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {QUICK_LINKS.map((link) => {
              const Icon = link.icon
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                >
                  <Icon className="size-3.5" />
                  {e[link.key]}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
