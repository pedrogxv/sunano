-- Molduras de ranking passam a ser CONCEDIDAS de verdade.
--
-- POR QUÊ
-- -------
-- A migration `20261117000000` desligou a concessão porque equipar não
-- existia: conceder por colocação punha no avatar algo que o dono não tinha
-- escolhido e não podia trocar. Equipar existe agora (`ProfileFramePicker`
-- em `/perfil`), então a trava sai — e some o "Em breve" da vitrine, que
-- dizia que a moldura ainda ia lançar quando o que faltava era a pessoa
-- entrar no pódio.
--
-- O MODELO: POSSE PERMANENTE, ALL-TIME
-- ------------------------------------
-- Entrar no top 3 concede a moldura PARA SEMPRE. Sair do pódio NÃO a tira.
--
-- Isso é o que faz a feature caber no sistema que já existe. Toda moldura
-- aqui é posse permanente em `user_aura_items`; uma que fosse revogável
-- seria a única exceção, e criaria o caso que nenhuma outra tem: o site
-- desequipando o avatar de alguém sozinho, porque um terceiro subiu no
-- placar. Quem foi 1º em Aura foi 1º em Aura — a honraria é do fato, não da
-- posição de hoje.
--
-- Consequência aceita: com o tempo mais de uma pessoa terá a mesma moldura.
-- É o mesmo que já vale para os marcos de ofensiva, e é preferível a tirar
-- do avatar de alguém algo que ele escolheu exibir.
--
-- O `rank:streak:*` continua FORA (ver `FRAME_RANK_BOARDS` no TS): o placar
-- de ofensiva é raso, 2º e 3º com zero dia — a moldura iria para quem não
-- fez nada. As linhas ficam no catálogo, inertes.
--
-- QUEM CONCEDE
-- ------------
-- Não há trigger. Ranking não tem evento onde pendurar um: ninguém "atinge"
-- o 1º lugar, a pessoa é 1º lugar enquanto ninguém a ultrapassa, e a
-- colocação muda por atividade de TERCEIROS. Quem concede é o cron
-- `/api/cron/rank-frames` chamando `grant_rank_frame(...)` abaixo.

-- Desfaz o sufixo que a 20261117000000 colou na descrição: a moldura voltou
-- a ser concedida, então a frase "(ainda não concedida)" virou mentira.
update public.aura_items
set description = replace(
      description,
      ' (ainda não concedida: ver lib/profile-frames.ts)',
      ''
    )
where slug like 'rank:%'
  and description like '%ainda não concedida%';

-- ────────────────────────────────────────────
-- Concessão
-- ────────────────────────────────────────────
-- Idempotente por construção: `on conflict do nothing` sobre a PK de
-- `user_aura_items`. O cron roda de hora em hora e reconcede o mesmo top 3
-- o tempo todo — só a PRIMEIRA vez insere, e só ela notifica.
--
-- A posse é só a linha `(user_id, item_id)`; não há flag de "ativo" aqui —
-- `active` é do CATÁLOGO (`aura_items`), e as molduras de rank nascem
-- `active = false` lá, que é o que as mantém fora de `listActiveAuraItems()`.
-- Quem lê posse é `getFrameCollection`.
--
-- Retorna o `item_id` só quando concedeu AGORA, e `null` quando a pessoa já
-- tinha. É o que o cron usa para decidir se notifica (sem isso ele avisaria
-- de hora em hora), e de quebra entrega o id que a notificação grava em
-- `entity_id` — senão o cron precisaria de uma segunda consulta ao catálogo.
create or replace function public.grant_rank_frame(
  p_user_id uuid,
  p_slug    text
) returns uuid
language plpgsql security definer
set search_path = public as $$
declare
  v_item_id uuid;
  v_granted integer := 0;
begin
  if p_slug not like 'rank:%' then
    raise exception 'grant_rank_frame: slug % não é moldura de ranking', p_slug;
  end if;

  select id into v_item_id from public.aura_items where slug = p_slug;

  if v_item_id is null then
    raise exception 'grant_rank_frame: item % não existe no catálogo', p_slug;
  end if;

  insert into public.user_aura_items (user_id, item_id)
  values (p_user_id, v_item_id)
  on conflict (user_id, item_id) do nothing;

  get diagnostics v_granted = row_count;
  return case when v_granted > 0 then v_item_id else null end;
end;
$$;

-- Só o service_role concede: a chamada vem do cron, nunca do cliente. Sem o
-- revoke de PUBLIC um `authenticated` chamaria a RPC e se auto-concederia a
-- moldura de 1º lugar (o grant de PUBLIC não sai revogando só anon/authenticated).
revoke execute on function public.grant_rank_frame(uuid, text) from public;

grant  execute on function public.grant_rank_frame(uuid, text) to service_role;

-- ────────────────────────────────────────────
-- Notificação
-- ────────────────────────────────────────────
-- Tipo próprio (não `system`): o sino precisa poder dizer "moldura nova" com
-- ícone e destino próprios, e um `system` genérico obrigaria a adivinhar isso
-- pelo texto. Recria o constraint inteiro porque Postgres não tem
-- `add value` para check — mesma forma da 20261001000001.
alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications add constraint notifications_type_check check (type in (
  'aura_received', 'post_comment', 'comment_reply', 'new_follower', 'system', 'mention',
  'new_post', 'order_status', 'support_reply', 'support_new_ticket', 'support_user_reply',
  'support_status', 'store_restock', 'affiliate_payout', 'rank_frame'
));

-- Uma notificação por (pessoa, moldura). A concessão é idempotente, mas a
-- notificação é uma linha solta: sem este índice, um `grant_rank_frame` que
-- devolvesse `true` duas vezes (restore de backup, reexecução manual) mandaria
-- o mesmo aviso de novo. `entity_id` guarda o item da moldura.
create unique index if not exists uniq_notifications_rank_frame_once
  on public.notifications (user_id, entity_id)
  where type = 'rank_frame';
