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
 * - Membro do Discord: `confirm_discord_membership` (20261015000000_discord_membership_achievement.sql)
 * - Indicação de amigo: `validate_referral` (20261023000000_referral_program.sql) — 50 direto + 20 indireto
 * - Conquistas por trilha: seeds de `20260808_achievements_streak.sql` e `20260919000000_aura_earned_achievements.sql`,
 *   creditadas por `check_and_award_track_achievements` (20260930000000_aura_fixed_rewards.sql)
 *
 * A divisão "passa / não passa pelo multiplicador" é a de
 * 20260930000000_aura_fixed_rewards.sql: multiplicador só em ganho por
 * atividade; recompensa de valor fixo paga o número cheio.
 * - Gastos (loja/VIP/nome): `redeem_aura_item`, `purchase_vip_with_aura`, `change_display_name_with_aura` (20260921*.sql, 20260922000007_redeem_aura_item_vip_discount.sql)
 * - Desconto VIP de 10% em todo gasto de Aura: 20261012000000_vip_aura_discount_everywhere.sql
 *   (escudo e medalha de evento) + 20260922000007 (moldura e troca de nome).
 *   Único item sem desconto: `purchase_vip_with_aura`, que recusa VIP ativo.
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
      "+10 de Aura, no máximo 1 vez a cada 24h. Passa pelo multiplicador de Ofensiva/VIP: quanto maior sua sequência, mais isso rende.",
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
      "+10 de Aura, 1 vez por periférico para sempre, mesmo se você excluir e recriar a avaliação. Passa pelo multiplicador.",
  },
  {
    id: "received-like",
    question: "Receber uma curtida (aura) em post ou comentário",
    answer:
      "+1 de Aura por curtida, direto para quem foi curtido. Passa pelo multiplicador de quem recebeu, e só conta se quem deu a curtida ainda tiver reações disponíveis no dia (veja os limites abaixo).",
  },
  {
    id: "missions",
    question: "Completar as tarefas diárias",
    answer:
      "Criar um post: +5. Comentar em algo: +3. Dar aura em algo (curtir post/comentário/comentário de periférico, ou votar em BOM OU BAGRE): +1. Completar as 3 no mesmo dia: +10 de bônus e avança sua Ofensiva. Esses valores são fixos, não passam pelo multiplicador.",
  },
  {
    id: "youtube",
    question: "Confirmar inscrição no canal do YouTube",
    answer: "+50 de Aura, uma única vez: conquista especial \"Inscrito\", não passa pelo multiplicador.",
  },
  {
    id: "discord",
    question: "Conectar o Discord e confirmar que está no servidor",
    answer: "+50 de Aura, uma única vez: conquista especial \"No Discord\", não passa pelo multiplicador. Vale uma vez por conta do Discord: a mesma conta não pode resgatar em dois perfis.",
  },
  {
    id: "referral",
    question: "Indicar um amigo que se cadastra no site",
    answer:
      "+50 de Aura por amigo, e +20 quando alguém que você indicou também indica outra pessoa. Valores fixos, não passam pelo multiplicador. Só conta depois que o amigo confirma a conta (entrar no Discord, conectar Google/Discord ou fazer 3 dias de ofensiva), e ele tem 30 dias para isso. Veja tudo em /indicar.",
  },
  {
    id: "achievements",
    question: "Desbloquear conquistas (posts, comentários, seguidores, Aura farmada)",
    answer:
      "Cada trilha tem 5 níveis (Bronze a Diamante) que pagam Aura ao serem alcançados: 10 / 25 / 50 / 100 / 250. Esses valores são fixos, não passam pelo multiplicador. A trilha \"Aura farmada\" usa o total histórico ganho (não o saldo atual), e a Aura que vem das próprias conquistas não conta nesse total.",
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
      "Custo fixo listado no card. Só funciona se você ainda não for VIP agora; se já for, renove pela assinatura paga ou espere expirar.",
  },
  {
    id: "name-change",
    question: "Trocar seu nome de exibição",
    answer: "Custo fixo listado no card, com cooldown de 3 dias entre trocas. VIP paga 10% a menos.",
  },
  {
    id: "streak-shield",
    question: "Comprar Proteção de Ofensiva",
    answer:
      "Você compra e a proteção fica guardada (sem prazo) até o dia em que precisar. Se perder 1 dia de missões, sua ofensiva não zera: ao fechar as 3 tarefas de novo, ela continua de onde estava e a proteção é consumida. A versão padrão (59 Aura) exige que você volte já no dia seguinte ao dia perdido; a de margem estendida (199 Aura) te dá até 3 dias para voltar. VIP paga 10% a menos nas duas. Cobre 1 dia perdido por vez; se você faltar 2 dias corridos, ou demorar além da margem, a proteção não salva. Só dá para ter uma guardada por vez.",
  },
  {
    id: "event-medal",
    question: "Resgatar uma medalha de evento paga em Aura",
    answer:
      "Alguns eventos em /conquistas dão a medalha em troca de Aura, pelo custo que aparece no card. VIP paga 10% a menos aqui também.",
  },
  {
    id: "peripheral",
    question: "Resgatar um periférico com Aura",
    answer:
      "Periféricos são prêmios físicos e de estoque limitado: quando as unidades acabam, o item aparece como esgotado para todo mundo, com o perfil de quem levou. Uma unidade por pessoa. Só quem tem Trust Factor \"Muito Bom\" ou superior, e nenhuma restrição ativa na conta, pode resgatar — o Trust Factor mede comportamento e integridade, sobe com participação legítima e sem punições, e leva tempo de casa.",
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
      "Não credita Aura direto para ninguém, mas conta para a tarefa diária \"dar aura em algo\" (+1, 1x/dia).",
  },
  {
    id: "follow",
    question: "Seguir outro usuário",
    answer:
      "Não gera Aura para quem segue nem para quem é seguido diretamente; só conta para a trilha de conquistas \"Seguidores\" de quem é seguido (que aí sim paga Aura ao bater um nível).",
  },
  {
    id: "undo",
    question: "Desfazer uma curtida/dislike que você deu",
    answer: "Estorna o que foi dado, mas não consome seus limites diários nem gera crédito de missão de novo.",
  },
  {
    id: "self",
    question: "Reagir ao próprio post/comentário",
    answer: "Bloqueado: você não pode dar nem receber Aura de si mesmo.",
  },
  {
    id: "edit",
    question: "Editar um post, comentário ou review já publicado",
    answer: "Não gera Aura nova; só a criação original credita, e não é possível creditar de novo editando.",
  },
]

export type TrustTierRow = {
  tier: "new" | "normal" | "verified"
  label: string
  criteria: string
  dailyLimit: string
  pairLimit: string
}

/**
 * Linhas da tabela de LIMITES DE REAÇÃO do FAQ.
 *
 * O degrau deixou de ser "conta verificada" (Discord/YouTube/VIP/14 dias) e
 * passou a derivar do Trust Factor: `get_giver_trust_tier` lê a faixa da conta
 * (ver a migration `20261129000000`). O critério de conta com menos de 3 dias
 * continua valendo por cima de tudo — é o anti-farm de conta descartável, e
 * nenhuma nota inicial deve furá-lo.
 *
 * A tabela NÃO cita pontuação: o usuário vê só a faixa, nunca o número.
 *
 * O parâmetro `youtubeEnabled` deixou de influenciar o texto (o sinal social
 * não decide mais o degrau), mas continua na assinatura para não quebrar quem
 * chama — `AuraFaqSection` passa a flag da env.
 */
export function buildTrustTierRows(_youtubeEnabled = false): TrustTierRow[] {
  return [
    {
      tier: "new",
      label: "Nova ou Baixa",
      criteria: "Conta com menos de 3 dias, ou Trust Factor Baixo, ou conta com restrição ativa",
      dailyLimit: "15 reações/dia (VIP não aumenta)",
      pairLimit: "1 por pessoa/dia",
    },
    {
      tier: "normal",
      label: "Regular",
      criteria: "Conta com 3+ dias e Trust Factor Regular",
      dailyLimit: "50 reações/dia (100 se VIP)",
      pairLimit: "3 por pessoa/dia",
    },
    {
      tier: "verified",
      label: "Bom ou superior",
      criteria: "Conta com 3+ dias e Trust Factor Bom, Muito Bom ou Excelente",
      dailyLimit: "50 reações/dia (100 se VIP)",
      pairLimit: "5 por pessoa/dia",
    },
  ]
}

/** Linhas da tabela de limites. Preferir `buildTrustTierRows`. */
export const TRUST_TIER_ROWS: TrustTierRow[] = buildTrustTierRows(false)

/* ────────────────────────────────────────────────────────────────────────
 * Trust Factor — conteúdo educativo
 *
 * Aura mede PARTICIPAÇÃO; Trust Factor mede COMPORTAMENTO. O texto abaixo é
 * o que explica isso ao usuário, e mora aqui (módulo puro) pelo mesmo motivo
 * do resto do FAQ: é lido pela Central de Informações (texto genérico) e pela
 * Central de Aura (ao lado dos números reais), e um texto duplicado entre as
 * duas divergiria na primeira correção.
 *
 * REGRA: nenhuma frase daqui cita a PONTUAÇÃO. O usuário vê só a faixa — os
 * números (50 de base, +3/dia, 80 para item físico) são internos, e publicá-los
 * entrega a régua para quem quer calibrar farm. Por isso o texto fala em
 * "faixa", "sobe", "leva tempo", nunca em "80 pontos".
 * ──────────────────────────────────────────────────────────────────────── */

export const TRUST_FAQ_INTRO =
  "O Trust Factor é a medida de confiança da sua conta no Sunano. Enquanto a Aura mede o quanto você PARTICIPA (e some quando você gasta), o Trust Factor mede como você se COMPORTA: ele não se compra, não se troca e não sobe por farmar. Toda conta começa no meio da escala, sem histórico suficiente para ser considerada confiável nem problemática, e caminha a partir do que você faz."

/** As cinco faixas, para a tabela do FAQ. Espelha `TRUST_LEVELS` em `lib/trust-factor.ts`. */
export const TRUST_FAQ_LEVEL_ROWS: Array<{ label: string; meaning: string }> = [
  { label: "Baixo", meaning: "Infrações recentes no histórico. Funções sensíveis ficam limitadas." },
  { label: "Regular", meaning: "Conta ainda sem histórico suficiente, ou se recuperando de uma infração." },
  { label: "Bom", meaning: "Participação legítima e nenhuma punição ativa." },
  { label: "Muito Bom", meaning: "Histórico consistente e contribuições úteis ao longo do tempo. É a faixa exigida para resgatar produto físico." },
  { label: "Excelente", meaning: "Referência da comunidade: tempo de casa, contribuição e zero problemas." },
]

export const TRUST_FAQ_UP_ENTRIES: AuraFaqEntry[] = [
  {
    id: "trust-up-clean",
    question: "Manter a conta sem punições",
    answer:
      "É o que mais pesa. Uma conta que participa e não coleciona advertências sobe sozinha com o tempo — você não precisa fazer nada de especial além de usar o site normalmente.",
  },
  {
    id: "trust-up-contribute",
    question: "Escrever posts, comentários e reviews úteis",
    answer:
      "Contribuição de verdade conta. Reviews de periférico, que são o conteúdo de maior esforço do site, entram nesse eixo.",
  },
  {
    id: "trust-up-missions",
    question: "Cumprir as missões diárias e manter a Ofensiva",
    answer:
      "Completar as tarefas do dia é a prova mais direta de participação contínua e legítima, então avança o Trust junto com a Ofensiva.",
  },
  {
    id: "trust-up-limit",
    question: "Existe um limite de quanto sobe por dia?",
    answer:
      "Sim, e é baixo de propósito: atividade normal rende pouco por dia, e ações repetitivas ou artificiais podem não render nada. O Trust é construído ao longo de semanas, não numa tarde — é exatamente isso que o torna difícil de manipular. Penalidades não seguem esse limite.",
  },
]

export const TRUST_FAQ_DOWN_ENTRIES: AuraFaqEntry[] = [
  {
    id: "trust-down-content",
    question: "Ter conteúdo removido por infração",
    answer:
      "Post ou comentário retirado pela moderação por quebrar as regras desconta Trust. Apagar o próprio conteúdo, por vontade própria, NÃO desconta nada.",
  },
  {
    id: "trust-down-warning",
    question: "Levar advertência, mute ou suspensão",
    answer:
      "Cada punição desconta, e quanto mais grave, maior o desconto e mais tempo leva para se recuperar. Uma suspensão pesa bem mais que uma advertência.",
  },
  {
    id: "trust-down-spam",
    question: "Spam, farming ou informação falsa",
    answer:
      "Publicação repetitiva, ganho artificial de Aura (como reações trocadas entre as mesmas contas) e informação deliberadamente falsa descontam Trust e podem levantar uma flag de segurança na conta.",
  },
  {
    id: "trust-down-fraud",
    question: "Fraude, manipulação ou furto",
    answer:
      "É o caso mais grave. Fraude zera o Trust Factor e bloqueia a conta, sem recuperação automática: só análise manual da equipe reverte.",
  },
]

export const TRUST_FAQ_GENERAL_ENTRIES: AuraFaqEntry[] = [
  {
    id: "trust-why-not-score",
    question: "Por que eu não vejo minha pontuação exata?",
    answer:
      "Você vê a faixa (Bom, Muito Bom…), e não um número. A pontuação exata, os pesos de cada evento e as regras detalhadas são internos de propósito: publicar a régua exata é entregar o mapa para quem quer manipular o sistema. A faixa te diz tudo o que muda na prática.",
  },
  {
    id: "trust-new-account",
    question: "Sou novo aqui. Consigo chegar na faixa mais alta rápido?",
    answer:
      "Não, e isso é intencional. Contas novas têm um teto temporário que sobe conforme a conta amadurece (nos primeiros dias, depois de uma semana, de um mês e de três meses). Mesmo fazendo tudo certo, uma conta recém-criada não alcança as faixas de cima — é o que impede alguém de criar contas descartáveis para pegar os prêmios mais disputados.",
  },
  {
    id: "trust-recovery",
    question: "Levei uma punição. Fico marcado para sempre?",
    answer:
      "Não. As penalidades perdem peso com o tempo: uma infração leve começa a aliviar depois de cerca de um mês e some ao longo dos meses seguintes; as médias e graves levam proporcionalmente mais. O registro continua no seu histórico para a equipe, mas para de pesar na sua faixa. A única exceção é fraude crítica, que não se recupera sozinha.",
  },
  {
    id: "trust-inactivity",
    question: "Se eu ficar um tempo sem entrar, meu Trust cai?",
    answer:
      "Não. Inatividade por si só não reduz o Trust Factor. Você só perde por comportamento, nunca por ausência.",
  },
  {
    id: "trust-physical",
    question: "O que o Trust Factor libera?",
    answer:
      "O principal é o resgate dos produtos FÍSICOS e limitados da Central de Aura, que exige a faixa \"Muito Bom\" ou superior e a conta sem nenhuma restrição ativa. São os prêmios de maior valor do site, então a trava é alta: é preciso tempo de casa e histórico limpo. O Trust também define quantas reações você pode dar por dia, e é um dos requisitos para o Sunano Tester.",
  },
  {
    id: "trust-flag",
    question: "Minha conta está \"em análise\". O que isso significa?",
    answer:
      "Uma flag de segurança foi levantada na sua conta (por suspeita de fraude, múltiplas contas ou identidade em verificação). Enquanto ela estiver aberta, funções sensíveis ficam bloqueadas mesmo que sua faixa esteja alta — a flag é independente da pontuação. Abra um chamado no Suporte para entender o caso.",
  },
  {
    id: "trust-vs-aura",
    question: "Comprar VIP ou ter muita Aura aumenta meu Trust Factor?",
    answer:
      "Não. São sistemas separados de propósito: Aura e VIP medem participação e assinatura, o Trust Factor mede comportamento. Nenhum valor em dinheiro ou em Aura compra confiança.",
  },
]
