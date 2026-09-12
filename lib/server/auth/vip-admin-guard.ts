import "server-only"

import * as z from "zod"

import {
  getAdminRoleRank,
  hasAdminPermission,
  isWebMaster,
  type AdminProfile,
} from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Guard ÚNICO das rotas que ESCREVEM no VIP de alguém
 * (`/api/admin/vips/[userId]/{grant,cancel,sync}`).
 *
 * Existe centralizado porque uma checagem de autorização repetida em 3 rotas é
 * uma checagem que uma hora diverge em 1 delas — e aqui divergir significa
 * deixar alguém conceder ou retirar acesso pago.
 *
 * REGRAS, e por que cada uma existe:
 *
 *  1. `vip_write` — a permissão do módulo. Hoje: webmaster e admin apenas.
 *     O `vendedor` tem só `vip_read` (consulta para atendimento).
 *
 *  2. NÃO PODE AGIR SOBRE SI MESMO (nem webmaster). Sem isto, qualquer um com
 *     `vip_write` se dá VIP vitalício sozinho, sem segunda pessoa envolvida e
 *     sem ninguém para notar. É a mesma trava que `/api/admin/users` já aplica
 *     ao cargo (`isTargetCurrentUser`), estendida ao VIP: quem precisa de VIP
 *     pede a outro admin, e fica registrado no `audit_log` com dois nomes.
 *
 *  3. NÃO PODE AGIR SOBRE ALGUÉM DE CARGO IGUAL OU SUPERIOR. Espelha a
 *     hierarquia que `/api/admin/users` já respeita via `isTargetWebMaster`,
 *     mas usando o RANK, que cobre também admin↔admin.
 *
 *     Hoje só webmaster e admin têm `vip_write`, então na prática isto barra
 *     um `admin` de mexer no VIP de um WEB MASTER (que é VIP por cargo) ou de
 *     outro admin. A regra fica em vigor pelo RANK, e não por uma lista de
 *     cargos, justamente para continuar correta se `vip_write` um dia voltar
 *     a um cargo mais baixo — foi assim que o `vendedor` conseguiu, por um
 *     momento, poder revogar o VIP dos donos do site.
 *
 *     WEB MASTER é a exceção: ele age sobre qualquer outro cargo (menos sobre
 *     si mesmo, pela regra 2), inclusive sobre outro webmaster — é quem
 *     responde pelo site.
 *
 * Devolve o perfil do ator e o cargo do alvo, ou uma resposta de erro pronta.
 */

/** O path param nunca chega validado — um id livre vai direto para consultas. */
export const vipUserIdSchema = z.string().uuid("Identificador de usuário inválido.")

export type VipGuardOk = {
  ok: true
  actor: AdminProfile
  /** Cargo do alvo ("user" = sem linha em admin_profiles). */
  targetRole: "user" | AdminProfile["role"]
}

export type VipGuardFail = {
  ok: false
  error: string
  status: 400 | 401 | 403
}

export async function authorizeVipWrite(
  rawUserId: string
): Promise<VipGuardOk | VipGuardFail> {
  const parsedId = vipUserIdSchema.safeParse(rawUserId)
  if (!parsedId.success) {
    return { ok: false, error: "Identificador de usuário inválido.", status: 400 }
  }
  const userId = parsedId.data

  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return { ok: false, error: auth.error ?? "Não autorizado.", status: auth.status as 401 | 403 }
  }
  if (!hasAdminPermission(auth.profile, "vip_write")) {
    return { ok: false, error: "Acesso negado", status: 403 }
  }

  // Regra 2 — nunca sobre a própria conta.
  if (auth.profile.id === userId) {
    return {
      ok: false,
      error:
        "Você não pode alterar o próprio VIP. Peça a outro administrador — toda concessão fica registrada com quem pediu e quem executou.",
      status: 403,
    }
  }

  // Regra 3 — hierarquia. Lido com o admin client porque a RLS de
  // `admin_profiles` só deixa o usuário ver a própria linha: com o client de
  // sessão, o alvo voltaria NULL e todo mundo pareceria "usuário comum",
  // que é exatamente o resultado que abriria a brecha.
  const db = createSupabaseAdminClient()
  const { data: target } = await db
    .from("admin_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle()

  const targetRole = (target?.role ?? "user") as VipGuardOk["targetRole"]

  if (!isWebMaster(auth.profile) && targetRole !== "user") {
    const actorRank = getAdminRoleRank(auth.profile.role)
    const targetRank = getAdminRoleRank(targetRole)
    // Rank menor = mais poderoso. Igual também é barrado: dois vendedores não
    // administram o VIP um do outro.
    if (targetRank <= actorRank) {
      return {
        ok: false,
        error:
          "Você não pode alterar o VIP de um usuário com cargo igual ou superior ao seu. Só o WEB Master pode.",
        status: 403,
      }
    }
  }

  return { ok: true, actor: auth.profile, targetRole }
}

/**
 * Mesma validação de id para a rota de LEITURA do detalhe. Leitura não precisa
 * da hierarquia (ver o estado de uma assinatura não muda nada), mas precisa do
 * id validado — e de `vip_read`.
 */
export async function authorizeVipRead(
  rawUserId: string
): Promise<{ ok: true; actor: AdminProfile } | VipGuardFail> {
  if (!vipUserIdSchema.safeParse(rawUserId).success) {
    return { ok: false, error: "Identificador de usuário inválido.", status: 400 }
  }

  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return { ok: false, error: auth.error ?? "Não autorizado.", status: auth.status as 401 | 403 }
  }
  if (!hasAdminPermission(auth.profile, "vip_read")) {
    return { ok: false, error: "Acesso negado", status: 403 }
  }
  return { ok: true, actor: auth.profile }
}
