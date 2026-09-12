import { NextResponse } from "next/server"

import { resolveAuthUser } from "@/lib/server/auth/resolve-auth-user"

export const dynamic = "force-dynamic"

/**
 * Sessão atual + perfis associados.
 *
 * Os componentes cliente usam este endpoint para descobrir quem está logado —
 * é a resposta AUTORITATIVA sobre a sessão. O `AuthProvider` pinta a interface
 * antes disso a partir do snapshot da última sessão conhecida
 * (lib/client/auth-snapshot.ts), mas é sempre esta resposta que confirma ou
 * corrige o palpite.
 *
 * A regra mora em `resolveAuthUser` (lib/server/auth/resolve-auth-user.ts) —
 * inclusive devolver `user: null` enquanto o segundo fator não foi concluído.
 */
export async function GET() {
  return NextResponse.json(await resolveAuthUser())
}
