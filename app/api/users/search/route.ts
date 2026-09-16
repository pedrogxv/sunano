import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import {
  getFollowedIdsAmong,
  searchUserProfiles,
} from "@/lib/server/repositories/users-repository"

export const dynamic = "force-dynamic"

/**
 * Busca de perfis pelo nome de exibição. Pública (usada em /pessoas por
 * visitantes anônimos), por isso não exige login — só limita a taxa para
 * não virar um scraping/DoS barato do diretório inteiro. Como
 * `/api/users/directory`, devolve também quais dos resultados o usuário
 * logado já segue.
 *
 * Dois parâmetros desligam o filtro que esconde o dono do site
 * (`SITE_OWNER_SLUG`), cada um com um motivo diferente:
 *
 * - `includeOwner=1` — seletores de perfil do admin (ver `ExpertAuthorPicker`
 *   em app/admin/tierlist/form.tsx). Só é honrado para quem tem
 *   `peripherals_write`; para os demais é ignorado em silêncio.
 * - `forMention=1` — autocomplete de @menção (`MentionTextarea`). Vale para
 *   qualquer um: o dono é o principal usuário do site e precisa ser citável,
 *   e o perfil dele já é público por link direto. Esconder da busca serve pra
 *   ele não dominar os rankings de /pessoas, o que não se aplica aqui.
 *
 * Contas banidas continuam fora em todos os casos.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q") ?? ""
  const limit = Math.min(Number(searchParams.get("limit")) || 10, 24)

  const rateLimit = await checkRateLimit({
    action: "users_search",
    identifier: getClientIdentifier(request),
    maxAttempts: 30,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Muitas buscas seguidas. Aguarde um instante." }, { status: 429 })
  }

  const includeOwner = searchParams.get("includeOwner") === "1"
  const forMention = searchParams.get("forMention") === "1"

  try {
    const canIncludeOwner =
      forMention ||
      (includeOwner
        ? await getAuthorizedProfile().then((auth) => hasAdminPermission(auth.profile, "peripherals_write"))
        : false)

    const profiles = await searchUserProfiles(query, limit, { includeOwner: canIncludeOwner })

    const user = await getRequestUser(request)
    const followedIds = user
      ? await getFollowedIdsAmong(user.id, profiles.map((p) => p.id))
      : []

    return NextResponse.json({
      ok: true,
      profiles,
      followedIds,
      currentUserId: user?.id ?? null,
    })
  } catch {
    return NextResponse.json({ error: "Erro ao buscar perfis." }, { status: 500 })
  }
}
