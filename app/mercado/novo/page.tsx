"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuthUser } from "@/components/providers/auth-context"
import { MarketListingForm } from "@/components/market/MarketListingForm"

export default function NovoAnuncioPage() {
  const { user, loading } = useAuthUser()

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href="/mercado"
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Voltar ao Mercado
      </Link>

      <h1 className="mb-1 text-2xl font-black tracking-tight text-foreground">Anunciar no Mercado</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Seu anúncio passa por moderação antes de ficar visível para os demais membros.
      </p>

      {loading ? null : !user ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">Você precisa estar logado para anunciar.</p>
          <Link href="/login">
            <Button variant="outline" size="sm">Entrar</Button>
          </Link>
        </div>
      ) : (
        <MarketListingForm />
      )}
    </div>
  )
}
