"use client"

import { useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SunanoLogo } from "@/components/ui/SunanoLogo"
import { useT } from "@/lib/use-t"

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useT()
  const e = t.errorPages
  const pathname = usePathname()
  const router = useRouter()
  const isAdmin = pathname?.startsWith("/admin") ?? false

  useEffect(() => {
    console.error("[error-boundary]", error)
  }, [error])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-12 text-center">
      <SunanoLogo showText className="mb-6" />

      <div className="relative mb-6 flex size-44 items-center justify-center rounded-[2.5rem] bg-black shadow-2xl ring-1 ring-white/10 sm:size-52">
        <div className="pointer-events-none absolute -inset-8 -z-10 rounded-full bg-amber-500/20 blur-3xl" />
        <Image
          src="/images/mascot/mascot-warning.png"
          alt="Mascote do Sunano segurando uma placa de atenção"
          width={280}
          height={280}
          priority
          className="size-36 object-contain sm:size-44"
        />
      </div>

      <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{e.errorTitle}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground sm:text-base">{e.errorBody}</p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted-foreground/50">{e.errorDigest(error.digest)}</p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => reset()}>
          <RotateCw className="size-4" />
          {e.tryAgain}
        </Button>
        <Button variant="outline" asChild>
          <Link href={isAdmin ? "/admin" : "/"}>{isAdmin ? e.backDashboard : e.backHome}</Link>
        </Button>
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
          {e.goBack}
        </Button>
      </div>
    </div>
  )
}
