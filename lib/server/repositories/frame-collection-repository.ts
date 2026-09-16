import "server-only"

import {
  RANK_FRAMES,
  STREAK_FRAMES,
  VIP_FOUNDER_FRAME,
  VIP_FRAME,
  cosmeticFrame,
  highestStreakMilestone,
  isVipFounderWindowOpen,
  streakFrameSlug,
  type ProfileFrame,
} from "@/lib/profile-frames"
import { getUserStreak } from "@/lib/server/repositories/achievements-repository"
import {
  getAvatarFrameOptOut,
  getEquippedAvatarFrameId,
  getUserAuraItemIds,
  getVipStatus,
} from "@/lib/server/repositories/aura-store-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * A COLEÇÃO de molduras de uma pessoa — tudo que ela tem, tudo que pode ter,
 * e o que falta para cada uma.
 *
 * POR QUE ESTE MÓDULO EXISTE
 * ---------------------------
 * A posse de moldura estava espalhada em três consultas que só a Central de
 * Aura sabia juntar (`listActiveAuraItems` para as compráveis,
 * `getVipFounderItemId` para a de Fundador, `getStreakFrameItemIds` para as
 * de Ofensiva — as duas últimas porque são `active = false` e NÃO aparecem no
 * catálogo ativo). O resultado é que só aquela tela conseguia responder "o
 * que eu tenho?", e ela respondia pela metade: mostrava um botão de equipar
 * para o MAIOR marco de ofensiva e nenhum para os outros três, mesmo a pessoa
 * possuindo os quatro de verdade em `user_aura_items`.
 *
 * Aqui a pergunta tem UMA resposta, montada uma vez: o editor de perfil, a
 * Central de Aura e qualquer tela futura leem a mesma lista, com o mesmo
 * critério de bloqueio. Sem isto, cada tela nova recompõe as três consultas e
 * erra de um jeito novo.
 *
 * O CRITÉRIO DE POSSE É O BANCO, NUNCA O `if` DA TELA
 * ---------------------------------------------------
 * `owned` sai de `user_aura_items` — a mesma linha que `equipAvatarFrame`
 * exige para deixar equipar. Derivar posse de `longest_streak` na tela faria
 * a interface oferecer um "Equipar" que a rota recusa com 403: a trava do
 * trigger (migration 20261121000000) concede TODOS os marcos alcançados, e é
 * ela que manda.
 *
 * O que a tela mostra como BLOQUEADO, por outro lado, é derivado — é a meta
 * ("faltam 7 dias"), não o direito.
 */

/** Por que uma moldura ainda não é sua, para a tela dizer o que fazer. */
export type FrameLockReason =
  /** Falta atingir um marco de ofensiva — `progress` diz quanto. */
  | "streak"
  /** Exige assinatura VIP ativa. */
  | "vip"
  /** Era da janela de lançamento, que já fechou (ou ainda está aberta). */
  | "founder"
  /** Comprável com Aura na Central. */
  | "purchase"
  /**
   * Falta entrar no top 3 do placar (molduras de ranking). NÃO é "em breve":
   * a moldura existe e é concedida pelo cron `/api/cron/rank-frames` — o que
   * falta é a colocação.
   */
  | "rank"

export type FrameCollectionEntry = {
  /**
   * Id do item em `aura_items`. `null` quando a moldura não existe como linha
   * no banco (as de ranking, e as demais se a migration não rodou) — sem id
   * não há o que equipar, e a tela mostra só a vitrine.
   */
  itemId: string | null
  frame: ProfileFrame
  /** Possui de verdade (linha em `user_aura_items`). Só isto libera equipar. */
  owned: boolean
  /** É a que está no slot `equipped_avatar_frame_id`. */
  equipped: boolean
  /** `null` quando é dela; senão, por que ainda não é. */
  lock: FrameLockReason | null
  /**
   * Se dá para gravar esta moldura no slot (`equipped_avatar_frame_id`).
   *
   * Hoje é sempre igual a `owned` — desde que a moldura de VIP virou posse de
   * verdade (migration `20261125000000`), toda moldura possuída é equipável e
   * nenhuma não-possuída é. O campo continua separado porque é ele que a tela
   * lê para decidir se desenha o botão, e `owned` é a resposta de "é minha?":
   * a moldura de VIP passou dois meses sendo a primeira sem ser a segunda, e
   * foi por confundir as duas que a tela ofereceu um "Equipar" que a rota
   * recusava com 403.
   */
  equippable: boolean
  /**
   * Quanto falta, em texto curto, quando o bloqueio é mensurável ("faltam 7
   * dias"). É o que transforma a vitrine em meta em vez de catálogo.
   */
  progressLabel: string | null
  /** Preço em Aura, para as compráveis. `null` nas concedidas. */
  auraCost: number | null
}

export type FrameCollection = {
  entries: FrameCollectionEntry[]
  /** Id equipado hoje, ou `null` — a tela usa para marcar "Nenhuma". */
  equippedItemId: string | null
  /**
   * O dono escolheu explicitamente NÃO exibir moldura.
   *
   * Distinto de `equippedItemId === null`: sem moldura equipada E sem opt-out,
   * o site ainda desenha a honraria (Fundador/VIP/Ofensiva) por precedência —
   * então "Nenhuma" só está de fato selecionado quando esta flag está ligada,
   * ou quando a pessoa não tem honraria nenhuma para cair.
   */
  frameOptOut: boolean
  /** Recorde de ofensiva, que decide os marcos. */
  longestStreak: number
  /** Quantas a pessoa de fato possui — o número que o cabeçalho mostra. */
  ownedCount: number
}

/** Linha de `aura_items` que interessa a uma moldura. */
type FrameItemRow = {
  id: string
  slug: string
  name: string
  description: string | null
  frame_asset_url: string | null
  aura_cost: number
  active: boolean
  acquisition: string | null
}

/**
 * TODAS as linhas de moldura do catálogo, ativas ou não.
 *
 * `listActiveAuraItems()` não serve aqui: ela filtra `active = true`, e as
 * molduras concedidas (Fundador, Ofensiva) são `active = false` de propósito
 * — ficam fora da vitrine de compráveis. Foi exatamente por esse filtro que a
 * Central precisou de duas consultas extras só para achar os ids delas.
 */
async function listFrameItemRows(): Promise<FrameItemRow[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("aura_items")
    .select("id, slug, name, description, frame_asset_url, aura_cost, active, acquisition")
    .eq("kind", "avatar_frame")
    .order("sort_order", { ascending: true })

  if (error) {
    console.error("[frame-collection-repository] listFrameItemRows:", error)
    return []
  }
  return (data ?? []) as FrameItemRow[]
}

/** Texto de quanto falta para um marco de ofensiva. */
function streakProgressLabel(milestone: number, longestStreak: number): string {
  const missing = milestone - longestStreak
  return `faltam ${missing} dia${missing === 1 ? "" : "s"}`
}

/**
 * A coleção completa de uma pessoa, na ordem em que a tela deve mostrar.
 *
 * ORDEM: possuídas primeiro (é o que ela veio usar), depois as alcançáveis
 * com progresso, e por último as indisponíveis. Uma vitrine que começa pelo
 * que a pessoa não tem parece uma loja; começando pelo que é dela, parece uma
 * coleção — que é o que ela é.
 */
export async function getFrameCollection(userId: string): Promise<FrameCollection> {
  const [rows, ownedIds, equippedItemId, streak, vip, frameOptOut] = await Promise.all([
    listFrameItemRows(),
    getUserAuraItemIds(userId),
    getEquippedAvatarFrameId(userId),
    getUserStreak(userId),
    getVipStatus(userId),
    getAvatarFrameOptOut(userId),
  ])

  const rowBySlug = new Map(rows.map((row) => [row.slug, row]))
  const longestStreak = streak.longest
  const entries: FrameCollectionEntry[] = []

  /**
   * Monta uma entrada amarrando a arte (código) à linha do banco (posse).
   *
   * `expired` é para a ÚNICA moldura cujo direito de exibir pode ser perdido
   * depois de concedido: a de VIP. Fundador é permanente por definição e um
   * marco de ofensiva sai do recorde, que não anda para trás — nesses dois a
   * posse basta. Ver `isFrameEntitled` em `lib/profile-frames.ts`, que aplica
   * a mesma regra na hora de DESENHAR.
   */
  function push(
    frame: ProfileFrame,
    lock: FrameLockReason | null,
    progressLabel: string | null,
    expired = false
  ) {
    const row = rowBySlug.get(frame.slug) ?? null
    const owned = row ? ownedIds.has(row.id) : false
    entries.push({
      itemId: row?.id ?? null,
      frame,
      owned,
      equipped: Boolean(row && equippedItemId === row.id),
      // Posse ganha de qualquer bloqueio derivado: quem tem, tem. Sem esta
      // precedência, um fundador que cancelou a assinatura veria a própria
      // moldura como "bloqueada — vire VIP", e um recorde recalculado para
      // baixo trancaria uma moldura já concedida.
      //
      // `expired` é a exceção deliberada: o ex-assinante POSSUI a moldura de
      // VIP (a posse não é apagada, para voltar sozinha se ele re-assinar),
      // mas o site não a desenha. Sem o cadeado aqui, ele a veria como sua,
      // com botão de equipar, e equipar não acenderia nada.
      lock: owned && !expired ? null : lock,
      progressLabel: owned && !expired ? null : progressLabel,
      // Posse de verdade é o que a rota de equipar exige — a mesma linha de
      // `user_aura_items` que ela consulta. Equipar uma moldura que não se
      // pode exibir é um clique sem efeito visível, então o expirado também
      // perde o botão.
      equippable: owned && !expired,
      auraCost: row && row.acquisition === "purchase" ? row.aura_cost : null,
    })
  }

  // ── Cosméticas compráveis: o que a Central vende hoje ──
  for (const row of rows) {
    if (row.acquisition !== "purchase" || !row.active) continue
    const frame = cosmeticFrame({
      slug: row.slug,
      name: row.name,
      description: row.description,
      frameAssetUrl: row.frame_asset_url,
    })
    // Sem asset não há o que desenhar — item sem arte é avatar sem moldura
    // (degradação suave), nunca um quadrado vazio na coleção.
    if (frame) push(frame, "purchase", null)
  }

  // ── Fundador: honraria permanente, janela com prazo ──
  // Fora da coleção para quem não tem depois da janela fechada: anunciar uma
  // honraria que ninguém mais consegue obter só frustra.
  if (rowBySlug.has(VIP_FOUNDER_FRAME.slug)) {
    const founderRow = rowBySlug.get(VIP_FOUNDER_FRAME.slug)
    const ownsFounder = founderRow ? ownedIds.has(founderRow.id) : false
    if (ownsFounder || isVipFounderWindowOpen()) {
      push(VIP_FOUNDER_FRAME, "founder", null)
    }
  }

  // ── VIP: item possuído como qualquer outro ──
  // Desde a migration `20261125000000` a assinatura CONCEDE a linha em
  // `user_aura_items` (trigger em `user_profiles`, os mesmos seis caminhos do
  // Fundador), então a moldura de VIP passa pelo `push` comum: posse do banco,
  // equipável pela mesma rota das outras.
  //
  // Antes ela era montada à mão com `equippable: false`, porque não existia
  // linha de posse para ninguém e o "Equipar" batia em 403. O efeito colateral
  // era pior que o botão morto: um assinante que equipasse qualquer outra
  // moldura não conseguia voltar para a de VIP — o fallback de precedência só
  // roda com o slot VAZIO, e nada podia ocupar o slot com ela.
  //
  // O bloqueio `vip` continua para quem não assina, e a EXIBIÇÃO ainda expira
  // junto da assinatura mesmo com a posse permanente: `isFrameEntitled` confere
  // `isVip` antes de desenhar uma equipada de `source: "vip"`.
  push(VIP_FRAME, "vip", null, !vip.active)

  // ── Ofensiva: as QUATRO, não só a maior ──
  // Mostrar as quatro é o ponto: quem tem 50 dias possui os quatro marcos de
  // verdade no banco e pode preferir exibir o anel discreto de 1 dia. A
  // Central só oferecia a mais alta, então essa escolha não existia.
  const reached = highestStreakMilestone(longestStreak)
  for (const frame of STREAK_FRAMES) {
    const milestone = Number(frame.slug.split(":")[1])
    const achieved = reached !== null && longestStreak >= milestone
    push(
      frame,
      achieved ? null : "streak",
      achieved ? null : streakProgressLabel(milestone, longestStreak)
    )
  }

  // ── Ranking: concedidas de verdade desde a 20261123000000 ──
  // Entrar no top 3 concede a posse para sempre (o cron `/api/cron/rank-frames`
  // faz a varredura); sair do pódio não tira. Por isso a posse é lida da mesma
  // fonte das outras — a linha em `user_aura_items` — e não da colocação de
  // agora: quem foi 1º continua com a moldura, ainda que hoje seja 4º.
  for (const frame of RANK_FRAMES) {
    push(frame, "rank", null)
  }

  // Possuídas primeiro; entre as bloqueadas, as que têm progresso antes das
  // que não têm. `sort` estável preserva a ordem de catálogo dentro de cada
  // grupo, então as de ofensiva continuam 1 → 10 → 25 → 50.
  entries.sort((a, b) => {
    if (a.owned !== b.owned) return a.owned ? -1 : 1
    // As de ranking por último entre as bloqueadas: são as mais difíceis e
    // as únicas cujo critério não depende só de esforço próprio (precisa
    // superar outras pessoas), então não devem encabeçar a lista do que
    // falta.
    const rank = (e: FrameCollectionEntry) => (e.lock === "rank" ? 2 : e.lock ? 1 : 0)
    return rank(a) - rank(b)
  })

  return {
    entries,
    equippedItemId,
    frameOptOut,
    longestStreak,
    ownedCount: entries.filter((entry) => entry.owned).length,
  }
}

/** Slug da moldura de um marco — reexportado para as telas não recalcularem. */
export { streakFrameSlug }
