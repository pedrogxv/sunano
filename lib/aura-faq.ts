/**
 * Conteúdo educativo da Central de Aura — todas as formas de ganhar/gastar
 * Aura, o que influencia o multiplicador e o que NÃO gera Aura, para o
 * accordion "Como funciona a Aura" (`AuraCenterContent`).
 *
 * Módulo puro (sem I/O): só documenta em texto os valores que o banco de
 * fato credita. Fontes por linha, para reconferir se algum número mudar:
 * - Criar post: `credit_forum_post_creation_aura` (20260804120000_aura_rebalance.sql)
 * - Comentar (fórum/notícia): `credit_comment_creation_aura` (mesma migration)
 * - Comentar em periférico: `credit_peripheral_comment_creation_aura` (20260830010000_peripheral_comments_and_votes.sql)
 * - Review de periférico: `credit_peripheral_review_creation_aura` (20260901000000_peripheral_reviews.sql)
 * - Curtida recebida: `toggle_forum_aura`/`toggle_forum_post_aura`/`toggle_peripheral_comment_aura` (20260923000002_aura_trust_tiers.sql)
 * - Missões diárias: `complete_daily_mission` (20260930000000_aura_fixed_rewards.sql)
 * - Inscrição YouTube: `confirm_youtube_subscription` (20260921120000_youtube_subscription_achievement.sql)
 * - Conquistas por trilha: seeds de `20260808_achievements_streak.sql` e `20260919000000_aura_earned_achievements.sql`,
 *   creditadas por `check_and_award_track_achievements` (20260930000000_aura_fixed_rewards.sql)
 *
 * A divisão "passa / não passa pelo multiplicador" é a de
 * 20260930000000_aura_fixed_rewards.sql: multiplicador só em ganho por
 * atividade; recompensa de valor fixo paga o número cheio.
 * - Gastos (loja/VIP/nome): `redeem_aura_item`, `purchase_vip_with_aura`, `change_display_name_with_aura` (20260921*.sql, 20260922000007_redeem_aura_item_vip_discount.sql)
 */

export type AuraFaqEntry = {
  id: string
  question: string
  answer: string
}

export const AURA_GAIN_ENTRIES: AuraFaqEntry[] = [
  {
    id: "post",
    question: "Criar um post no fórum",
    answer:
      "+10 de Aura, no máximo 1 vez a cada 24h. Passa pelo multiplicador de Ofensiva/VIP — quanto maior sua sequência, mais isso rende.",
  },
  {
    id: "comment",
    question: "Comentar num post ou notícia",
    answer:
      "+5 de Aura, 1 vez por post/notícia para sempre (comentar de novo no mesmo não credita outra vez). Passa pelo multiplicador.",
  },
  {
    id: "peripheral-comment",
    question: "Comentar num periférico",
    answer: "+5 de Aura, 1 vez por periférico para sempre. Passa pelo multiplicador.",
  },
  {
    id: "review",
    question: "Escrever uma avaliação (review) de periférico",
    answer:
      "+10 de Aura, 1 vez por periférico para sempre — mesmo se você excluir e recriar a avaliação. Passa pelo multiplicador.",
  },
  {
    id: "received-like",
    question: "Receber uma curtida (aura) em post ou comentário",
    answer:
      "+1 de Aura por curtida, direto para quem foi curtido. Passa pelo multiplicador de quem recebeu — e só conta se quem deu a curtida ainda tiver reações disponíveis no dia (veja os limites abaixo).",
  },
  {
    id: "missions",
    question: "Completar as tarefas diárias",
    answer:
      "Criar um post: +5. Comentar em algo: +3. Dar aura em algo (curtir post/comentário/comentário de periférico, ou votar em BOM OU BAGRE): +1. Completar as 3 no mesmo dia: +10 de bônus e avança sua Ofensiva. Esses valores são fixos — não passam pelo multiplicador.",
  },
  {
    id: "youtube",
    question: "Confirmar inscrição no canal do YouTube",
    answer: "+50 de Aura, uma única vez — conquista especial \"Inscrito\", não passa pelo multiplicador.",
  },
  {
    id: "achievements",
    question: "Desbloquear conquistas (posts, comentários, seguidores, Aura farmada)",
    answer:
      "Cada trilha tem 5 níveis (Bronze a Diamante) que pagam Aura ao serem alcançados: 10 / 25 / 50 / 100 / 250. Esses valores são fixos — não passam pelo multiplicador. A trilha \"Aura farmada\" usa o total histórico ganho (não o saldo atual), e a Aura que vem das próprias conquistas não conta nesse total.",
  },
]

export const AURA_SPEND_ENTRIES: AuraFaqEntry[] = [
  {
    id: "store-item",
    question: "Resgatar uma moldura de avatar na loja",
    answer: "Custa o valor listado no card do item. VIP paga 10% a menos.",
  },
  {
    id: "vip",
    question: "Ativar 1 mês de VIP com Aura",
    answer:
      "Custo fixo listado no card. Só funciona se você ainda não for VIP agora — se já for, renove pela assinatura paga ou espere expirar.",
  },
  {
    id: "name-change",
    question: "Trocar seu nome de exibição",
    answer: "Custo fixo listado no card, com cooldown de 3 dias entre trocas. VIP paga 10% a menos.",
  },
  {
    id: "dislike",
    question: "Receber um dislike",
    answer: "-1 de Aura, sem multiplicador. Seu saldo nunca fica negativo.",
  },
]

export const AURA_NOT_COUNTED_ENTRIES: AuraFaqEntry[] = [
  {
    id: "vote",
    question: "Votar \"BOM OU BAGRE\" num periférico",
    answer:
      "Não credita Aura direto para ninguém — mas conta para a tarefa diária \"dar aura em algo\" (+1, 1x/dia).",
  },
  {
    id: "follow",
    question: "Seguir outro usuário",
    answer:
      "Não gera Aura para quem segue nem para quem é seguido diretamente — só conta para a trilha de conquistas \"Seguidores\" de quem é seguido (que aí sim paga Aura ao bater um nível).",
  },
  {
    id: "undo",
    question: "Desfazer uma curtida/dislike que você deu",
    answer: "Estorna o que foi dado, mas não consome seus limites diários nem gera crédito de missão de novo.",
  },
  {
    id: "self",
    question: "Reagir ao próprio post/comentário",
    answer: "Bloqueado — você não pode dar nem receber Aura de si mesmo.",
  },
  {
    id: "edit",
    question: "Editar um post, comentário ou review já publicado",
    answer: "Não gera Aura nova — só a criação original credita, e não é possível creditar de novo editando.",
  },
]

export const TRUST_TIER_ROWS: Array<{
  tier: "new" | "normal" | "verified"
  label: string
  criteria: string
  dailyLimit: string
  pairLimit: string
}> = [
  {
    tier: "new",
    label: "Nova",
    criteria: "Conta com menos de 3 dias",
    dailyLimit: "15 reações/dia (VIP não aumenta)",
    pairLimit: "1 por pessoa/dia",
  },
  {
    tier: "normal",
    label: "Normal",
    criteria: "Conta com 3+ dias, sem YouTube confirmado nem VIP, e com menos de 14 dias",
    dailyLimit: "50 reações/dia (100 se VIP)",
    pairLimit: "3 por pessoa/dia",
  },
  {
    tier: "verified",
    label: "Verificada",
    criteria: "YouTube confirmado, ou VIP ativo, ou conta com 14+ dias",
    dailyLimit: "50 reações/dia (100 se VIP)",
    pairLimit: "5 por pessoa/dia",
  },
]
