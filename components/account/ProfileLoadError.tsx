"use client"

import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Estado de falha da carga do perfil, compartilhado pelas telas que dependem
 * de `useOwnProfile` (/perfil, /conta e as sub-rotas da conta).
 *
 * Existe porque todas elas resolviam a carga com `if (loading || !profile)`
 * caindo no `BoxLoader`: quando `/api/profile` falha, `loading` vira `false`
 * mas `profile` continua `null`, e a condição segue verdadeira para sempre —
 * esqueleto eterno, sem erro, sem retentativa e sem nada no console. É o
 * caminho pelo qual um WEB MASTER sem 2FA ficou trancado fora de /conta
 * (ver proxy.ts, `isMfaSetupAllowedPath`).
 */
export function ProfileLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-400" aria-hidden />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Não foi possível carregar seu perfil</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Pode ter sido uma falha momentânea de conexão. Tente novamente — se
          continuar, saia e entre na conta de novo.
        </p>
      </div>
      <Button onClick={onRetry} variant="outline">
        Tentar novamente
      </Button>
    </div>
  )
}
