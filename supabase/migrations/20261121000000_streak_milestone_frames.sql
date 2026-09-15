-- Molduras de Ofensiva — honraria por MARCO de dias (1, 10, 25 e 50).
--
-- O QUE É
-- -------
-- Quem alcança N dias seguidos completando as missões diárias ganha a
-- moldura daquele marco como POSSE de verdade em `user_aura_items`. São
-- quatro itens independentes: quem chega aos 50 possui as quatro, e escolhe
-- na Central de Aura qual exibir.
--
-- POR QUE MARCO, E NÃO PÓDIO
-- ---------------------------
-- `20261117000000` tirou as molduras `rank:streak:*` de circulação porque o
-- placar de ofensiva é raso: o 2º e o 3º lugar tinham ZERO dia, então a
-- "moldura de pódio" ia para quem não fez nada. Marco não tem esse problema —
-- não há disputa a ganhar, só um número a alcançar, e a moldura diz a mesma
-- coisa para todo mundo que a tem. As linhas `rank:streak:*` seguem inertes
-- no catálogo (`active = false`, não concedidas); estas são outras, com slug
-- próprio (`streak:<dias>`).
--
-- POR QUE `longest_streak`, E NÃO `current_streak`
-- ------------------------------------------------
-- Um marco alcançado não se desfaz. Conceder por `current_streak` daria a
-- posse igual (o trigger dispara no mesmo instante), mas amarrar a EXIBIÇÃO à
-- ofensiva viva faria a moldura sumir do avatar no primeiro dia perdido —
-- punição desproporcional para quem ficou doente, e o oposto do que uma
-- conquista significa. `longest_streak` é monotônico (`greatest(...)` em toda
-- versão de `complete_daily_mission`), então serve de fonte estável.
--
-- POR QUE UM TRIGGER, E NÃO UM `if` EM `complete_daily_mission`
-- -------------------------------------------------------------
-- Mesmo motivo do trigger de Fundador (`20261118000000`): a ofensiva é
-- escrita por VÁRIAS versões da mesma RPC, que foram sendo recriadas ao longo
-- do tempo (20260808000001, 20260811000000, 20260828, 20260930000000,
-- 20261004000000 …). Pôr a concessão dentro do corpo dela significa que a
-- próxima recriação que esquecer o trecho quebra a concessão em silêncio — e
-- isso só aparece como "bati 50 dias e não ganhei" no suporte. O único ponto
-- por onde TODAS passam é a escrita em `user_streaks`. O trigger mora lá.
--
-- A ARTE fica no código (`lib/profile-frames.ts`, slugs `streak:1`,
-- `streak:10`, `streak:25`, `streak:50`), mesmo modelo das outras molduras: o
-- banco guarda identidade e posse, o código guarda o desenho. Item sem arte =
-- avatar sem moldura (degradação suave), nunca tela quebrada.

-- ────────────────────────────────────────────
-- 1. Os itens no catálogo
-- ────────────────────────────────────────────
-- `acquisition = 'grant'`: não se compra com Aura em hipótese alguma —
-- `redeem_aura_item` levanta `item_not_purchasable` para tudo que não é
-- `purchase` (ver 20261116000000). Quem concede é o trigger abaixo.
--
-- `active = false`: fora da vitrine de itens compráveis. A seção "Molduras"
-- da Central de Aura as mostra à parte, a partir do catálogo em código.
--
-- `frame_asset_url = null` de propósito: são anéis desenhados em código
-- (turquesa → ciano, com o pássaro da ofensiva), não PNGs.
-- `resolveProfileFrame` as identifica pelo SLUG, não pela URL.
insert into public.aura_items
  (slug, name, description, kind, image_url, frame_asset_url, aura_cost, acquisition, active, sort_order)
values
  ('streak:1', 'Ofensiva',
   'Concedida a quem manteve uma ofensiva por 1 dia completando as missões diárias. Fica com você para sempre, mesmo que a ofensiva acabe.',
   'avatar_frame', null, null, 0, 'grant', false, 950),
  ('streak:10', 'Ofensiva de 10',
   'Concedida a quem manteve uma ofensiva por 10 dias seguidos completando as missões diárias. Fica com você para sempre, mesmo que a ofensiva acabe.',
   'avatar_frame', null, null, 0, 'grant', false, 951),
  ('streak:25', 'Ofensiva de 25',
   'Concedida a quem manteve uma ofensiva por 25 dias seguidos completando as missões diárias. Fica com você para sempre, mesmo que a ofensiva acabe.',
   'avatar_frame', null, null, 0, 'grant', false, 952),
  ('streak:50', 'Ofensiva de 50',
   'Concedida a quem manteve uma ofensiva por 50 dias seguidos completando as missões diárias. Fica com você para sempre, mesmo que a ofensiva acabe.',
   'avatar_frame', null, null, 0, 'grant', false, 953)
on conflict (slug) do update
  set name        = excluded.name,
      description = excluded.description,
      acquisition = excluded.acquisition,
      kind        = excluded.kind,
      sort_order  = excluded.sort_order;

-- ────────────────────────────────────────────
-- 2. Os marcos, em um lugar só
-- ────────────────────────────────────────────
-- Função imutável para que a lista não fique copiada entre o trigger e o
-- backfill. Espelha `FRAME_STREAK_MILESTONES` em `lib/profile-frames.ts` —
-- mudar um exige mudar o outro (o do banco é o que vale: é ele que decide
-- quem de fato recebe).
create or replace function public.streak_frame_milestones()
returns integer[] language sql immutable as $$
  select array[1, 10, 25, 50];
$$;

comment on function public.streak_frame_milestones() is
  'Marcos de ofensiva que concedem moldura. Espelha FRAME_STREAK_MILESTONES em lib/profile-frames.ts — mudar um exige mudar o outro.';

-- ────────────────────────────────────────────
-- 3. Concessão idempotente
-- ────────────────────────────────────────────
-- Uma função só, usada pelo trigger E pelo backfill, para que as duas
-- concessões não possam divergir.
--
-- Concede TODOS os marcos que `p_longest_streak` alcança, não só o maior:
-- quem chega aos 50 possui as quatro molduras e escolhe qual equipar. Dar só
-- a mais alta tiraria da pessoa a opção de exibir uma mais discreta.
--
-- Devolve quantas posses foram criadas AGORA — o backfill usa para contar.
create or replace function public.grant_streak_frames(p_user_id uuid, p_longest_streak integer)
returns integer language plpgsql security definer
set search_path = public as $$
declare
  v_granted integer;
begin
  insert into public.user_aura_items (user_id, item_id)
  select p_user_id, i.id
  from unnest(public.streak_frame_milestones()) as milestone
  join public.aura_items i on i.slug = 'streak:' || milestone
  where p_longest_streak >= milestone
  -- `do nothing`: cada dia novo de ofensiva passa por aqui de novo; a posse é
  -- uma só e `acquired_at` guarda a PRIMEIRA vez que o marco foi batido.
  on conflict (user_id, item_id) do nothing;

  get diagnostics v_granted = row_count;
  return v_granted;
end;
$$;

comment on function public.grant_streak_frames(uuid, integer) is
  'Concede as molduras de todos os marcos de ofensiva que o recorde alcança. Idempotente. Chamada pelo trigger de user_streaks e pelo backfill.';

revoke execute on function public.grant_streak_frames(uuid, integer) from public, anon, authenticated;

grant execute on function public.grant_streak_frames(uuid, integer) to service_role;

-- ────────────────────────────────────────────
-- 4. O gatilho: bateu o marco, ganhou
-- ────────────────────────────────────────────
-- AFTER, não BEFORE: a posse só faz sentido depois que o recorde de fato
-- subiu na linha.
--
-- Condição: `longest_streak` AUMENTOU. Só então pode haver marco novo — um
-- UPDATE que só mexe em `current_streak`/`last_completed_date` (o caso comum,
-- de quem continua uma ofensiva abaixo do próprio recorde) não precisa
-- reavaliar nada, e sem esta guarda o trigger faria um INSERT inútil a cada
-- missão completada do site inteiro.
create or replace function public.on_streak_record_grant_frames()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.longest_streak > coalesce(old.longest_streak, -1) then
    perform public.grant_streak_frames(new.user_id, new.longest_streak);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_grant_streak_frames on public.user_streaks;

create trigger trg_grant_streak_frames
  after update of longest_streak on public.user_streaks
  for each row execute function public.on_streak_record_grant_frames();

-- INSERT: a primeira vez que a pessoa fecha as 3 missões, a linha NASCE com
-- `longest_streak = 1` — não há UPDATE nenhum, então sem este trigger a
-- moldura `streak:1` jamais seria concedida a quem está começando agora.
create or replace function public.on_streak_inserted_grant_frames()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.longest_streak > 0 then
    perform public.grant_streak_frames(new.user_id, new.longest_streak);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_grant_streak_frames_insert on public.user_streaks;

create trigger trg_grant_streak_frames_insert
  after insert on public.user_streaks
  for each row execute function public.on_streak_inserted_grant_frames();

-- ────────────────────────────────────────────
-- 5. Backfill — quem JÁ bateu os marcos
-- ────────────────────────────────────────────
-- Quem construiu a ofensiva antes desta migration não passou por nenhum
-- trigger, e não teria como receber. Sem este passo a moldura sairia
-- premiando só quem começasse a contar DEPOIS do deploy, punindo exatamente
-- quem manteve a sequência por mais tempo — o oposto do que ela celebra.
--
-- Critério: `longest_streak` (o RECORDE), e não a ofensiva viva. Quem fez 50
-- dias e perdeu a sequência ontem recebe as quatro molduras, porque fez os 50
-- dias.
do $$
declare
  v_count integer;
begin
  insert into public.user_aura_items (user_id, item_id)
  select s.user_id, i.id
  from public.user_streaks s
  cross join unnest(public.streak_frame_milestones()) as milestone
  join public.aura_items i on i.slug = 'streak:' || milestone
  where s.longest_streak >= milestone
  on conflict (user_id, item_id) do nothing;

  get diagnostics v_count = row_count;
  raise notice 'Molduras de Ofensiva concedidas no backfill: % posses.', v_count;
end $$;

-- ────────────────────────────────────────────
-- 6. Equipar para quem não escolheu nada
-- ────────────────────────────────────────────
-- Mesma lógica de `20261119000000` (Fundador): a moldura só aparece no site
-- quando está EQUIPADA — é o slot `user_profiles.equipped_avatar_frame_id`
-- que todas as telas leem. Sem este passo, o backfill acima daria posse a
-- centenas de pessoas e NENHUM avatar mudaria; a honraria existiria só no
-- banco.
--
-- A TRAVA QUE IMPORTA: `equipped_avatar_frame_id is null` — só preenche slot
-- VAZIO. Sobrescrever apagaria a escolha de quem já equipou uma cosmética (ou
-- a de Fundador), que é o oposto da precedência do módulo ("a equipada ganha
-- de tudo").
--
-- Equipa o MAIOR marco que a pessoa tem: é o que ela iria escolher, e é o
-- que `resolveProfileFrame` mostraria de qualquer forma no fallback. Trocar
-- por outro é um clique na Central de Aura.
--
-- Isto é um BACKFILL de uma vez, não uma regra: quem bater um marco novo daqui
-- para a frente recebe a POSSE pelo trigger e equipa se quiser. Conceder não
-- é equipar.
do $$
declare
  v_count integer;
begin
  update public.user_profiles p
  set equipped_avatar_frame_id = best.item_id
  from (
    select distinct on (s.user_id)
      s.user_id,
      i.id as item_id
    from public.user_streaks s
    cross join unnest(public.streak_frame_milestones()) as milestone
    join public.aura_items i on i.slug = 'streak:' || milestone
    where s.longest_streak >= milestone
    order by s.user_id, milestone desc
  ) as best
  where best.user_id = p.id
    and p.equipped_avatar_frame_id is null;

  get diagnostics v_count = row_count;
  raise notice 'Moldura de Ofensiva equipada para % pessoas sem moldura escolhida.', v_count;
end $$;
