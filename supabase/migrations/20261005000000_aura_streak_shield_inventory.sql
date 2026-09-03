-- Proteção de Ofensiva — modelo "inventário" (abordagem A).
--
-- ANTES (20261004000000): a compra ancorava a janela de proteção no dia da
-- compra (`protected_until = hoje + days - 1`). Quem comprava "pra ter
-- guardado" e não perdia nenhum dia dentro da janela jogava a Aura fora, e
-- não podia recomprar enquanto a janela corria.
--
-- AGORA: comprar só ARMA o escudo. Ele fica guardado sem prazo. A proteção
-- é resolvida no momento em que `complete_daily_mission` detecta um buraco:
-- se o buraco couber na regra, a ofensiva continua (prev + 1) e o escudo é
-- CONSUMIDO (linha marcada, não apagada — telemetria).
--
-- Regra de cobertura ("sempre 1 buraco, grace_days = margem de atraso"):
-- um escudo com `grace_days = G` salva a ofensiva se, e só se,
--   • o usuário perdeu exatamente 1 dia — o dia seguinte a
--     `last_completed_date` — e nenhum outro depois dele já completo; e
--   • voltou dentro da margem: `hoje - last_completed_date <= G + 1`
--     (perdeu D+1, tem de D+2 até D+1+G para fechar as 3 missões).
-- Perdeu 2+ dias corridos → não cobre (é "um buraco só"). Voltou além da
-- margem → não cobre, e o escudo se perde junto com a ofensiva.
--
-- Sem job noturno, como antes: `streak_shield_covers_gap` / `streak_is_alive`
-- e os espelhos em `achievements-repository.ts` calculam tudo na leitura.
-- Continua 1 escudo guardado por vez — `shield_already_armed` barra a
-- recompra enquanto `consumed_at is null`.

-- ────────────────────────────────────────────
-- 1. Remodela user_streak_shields: guardado vs. consumido
-- ────────────────────────────────────────────
-- Idempotente: a 20261004000000 pode ou não ter rodado neste ambiente.
create table if not exists public.user_streak_shields (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.user_streak_shields
  add column if not exists grace_days       integer,
  add column if not exists source_item_slug text,
  add column if not exists armed_at         timestamptz not null default now(),
  add column if not exists consumed_at      timestamptz;

-- Migra linhas do formato antigo, se existirem, para o novo.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_streak_shields' and column_name = 'days'
  ) then
    update public.user_streak_shields set grace_days = coalesce(grace_days, days);
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_streak_shields' and column_name = 'activated_at'
  ) then
    update public.user_streak_shields set armed_at = coalesce(armed_at, activated_at);
  end if;
end $$;

alter table public.user_streak_shields
  drop column if exists protected_until,
  drop column if exists days,
  drop column if exists activated_at;

alter table public.user_streak_shields
  alter column grace_days set not null;
alter table public.user_streak_shields
  alter column source_item_slug set not null;

alter table public.user_streak_shields
  drop constraint if exists user_streak_shields_grace_days_check;
alter table public.user_streak_shields
  add constraint user_streak_shields_grace_days_check check (grace_days > 0);

alter table public.user_streak_shields enable row level security;

-- Pública como `user_streaks`: o estado "ofensiva congelada" aparece no
-- perfil/mini-perfil/comentários de qualquer um. Escrita só via RPC.
drop policy if exists "Streak shields are publicly readable" on public.user_streak_shields;
create policy "Streak shields are publicly readable"
  on public.user_streak_shields for select using (true);

-- ────────────────────────────────────────────
-- 2. Garante kind + reason (no-op se a 20261004000000 já rodou)
-- ────────────────────────────────────────────
alter table public.aura_items
  drop constraint if exists aura_items_kind_check;
alter table public.aura_items
  add constraint aura_items_kind_check check (kind in (
    'avatar_frame', 'vip_month', 'display_name_change', 'streak_shield'
  ));

alter table public.aura_ledger
  drop constraint if exists aura_ledger_reason_check;
alter table public.aura_ledger
  add constraint aura_ledger_reason_check check (reason in (
    'post_aura_received', 'post_aura_removed',
    'comment_aura_received', 'comment_aura_removed',
    'event_medal_redeemed',
    'blog_post_aura_received', 'blog_post_aura_removed',
    'blog_comment_aura_received', 'blog_comment_aura_removed',
    'post_aura_disliked', 'post_aura_undisliked',
    'comment_aura_disliked', 'comment_aura_undisliked',
    'blog_post_aura_disliked', 'blog_post_aura_undisliked',
    'blog_comment_aura_disliked', 'blog_comment_aura_undisliked',
    'post_created', 'comment_created', 'blog_comment_created',
    'daily_mission_completed', 'daily_streak_bonus', 'achievement_unlocked',
    'peripheral_comment_aura_received', 'peripheral_comment_aura_removed',
    'peripheral_comment_aura_disliked', 'peripheral_comment_aura_undisliked',
    'peripheral_comment_created',
    'peripheral_review_created',
    'aura_item_redeemed',
    'youtube_subscription_confirmed',
    'vip_purchased',
    'display_name_changed',
    'account_banned_adjustment',
    'streak_shield_purchased'
  ));

-- ────────────────────────────────────────────
-- 3. Seed / atualização do catálogo
--    Descrição agora fala em "guardar" e "margem", não em janela fixa.
-- ────────────────────────────────────────────
insert into public.aura_items (slug, name, description, kind, image_url, frame_asset_url, aura_cost, active, sort_order)
values
  (
    'protecao-ofensiva-1d',
    'Proteção de Ofensiva',
    'Fica guardada até você precisar: se perder 1 dia de missões, sua ofensiva não zera. Volte no dia seguinte para resgatar.',
    'streak_shield',
    null,
    -- `frame_asset_url` é `not null` mas só faz sentido para avatar_frame.
    '',
    59,
    true,
    -4
  ),
  (
    'protecao-ofensiva-3d',
    'Proteção de Ofensiva — 3 dias de margem',
    'Fica guardada até você precisar: se perder 1 dia de missões, sua ofensiva não zera — e você tem até 3 dias para voltar e resgatar.',
    'streak_shield',
    null,
    '',
    199,
    true,
    -3
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- ────────────────────────────────────────────
-- 4. purchase_streak_shield — arma o escudo (sem calcular janela)
-- ────────────────────────────────────────────
-- Assinatura de retorno muda: agora devolve `grace_days` (integer), não a
-- data `protected_until`. Precisa do drop porque muda o tipo de retorno.
drop function if exists public.purchase_streak_shield(uuid, uuid);

create function public.purchase_streak_shield(p_user_id uuid, p_item_id uuid)
returns integer language plpgsql security definer
set search_path = public as $$
declare
  v_aura_cost integer;
  v_active    boolean;
  v_kind      text;
  v_slug      text;
  v_grace     integer;
  v_consumed  timestamptz;
  v_exists    boolean;
begin
  select aura_cost, active, kind, slug into v_aura_cost, v_active, v_kind, v_slug
  from public.aura_items
  where id = p_item_id
  for update;

  if not found or not v_active or v_kind <> 'streak_shield' then
    raise exception 'item_unavailable';
  end if;

  v_grace := case v_slug
    when 'protecao-ofensiva-1d' then 1
    when 'protecao-ofensiva-3d' then 3
    else null
  end;
  if v_grace is null then
    raise exception 'item_unavailable';
  end if;

  -- Lock na linha do escudo: barra duplo-clique comprando 2x antes do
  -- primeiro commit E torna "já tem escudo guardado?" atômico com o débito.
  -- 1 guardado por vez: enquanto `consumed_at is null` não recompra.
  select true, consumed_at into v_exists, v_consumed
  from public.user_streak_shields
  where user_id = p_user_id
  for update;

  if v_exists and v_consumed is null then
    raise exception 'shield_already_armed';
  end if;

  update public.user_aura_wallet
  set balance = balance - v_aura_cost, updated_at = now()
  where user_id = p_user_id and balance >= v_aura_cost;

  if not found then
    raise exception 'insufficient_aura_balance';
  end if;

  insert into public.user_streak_shields (user_id, grace_days, source_item_slug, armed_at, consumed_at)
  values (p_user_id, v_grace, v_slug, now(), null)
  on conflict (user_id) do update set
    grace_days = excluded.grace_days,
    source_item_slug = excluded.source_item_slug,
    armed_at = now(),
    consumed_at = null;

  insert into public.aura_ledger (user_id, delta, reason)
  values (p_user_id, -v_aura_cost, 'streak_shield_purchased');

  return v_grace;
end;
$$;

revoke execute on function public.purchase_streak_shield(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purchase_streak_shield(uuid, uuid) to service_role;

-- ────────────────────────────────────────────
-- 5. streak_shield_covers_gap — a regra única de "o escudo guardado salva
--    este buraco?". Espelhada em `shieldCoversGap` (achievements-repository).
--
--    `p_shield_armed` = existe um escudo guardado (consumed_at is null).
--    Cobre se: o último dia completo foi anteontem…até `grace_days` dias
--    atrás (perdeu 1 dia só — ontem NÃO conta, aí a ofensiva está viva
--    naturalmente) e a margem ainda alcança hoje:
--      last_completed_date  in  [hoje - (grace_days + 1) , hoje - 2]
-- ────────────────────────────────────────────
create or replace function public.streak_shield_covers_gap(
  p_last_completed_date date,
  p_shield_armed        boolean,
  p_grace_days          integer
) returns boolean language sql immutable as $$
  select
    coalesce(p_shield_armed, false)
    and p_last_completed_date is not null
    and p_grace_days is not null
    and p_last_completed_date <= (now() at time zone 'utc')::date - 2
    and p_last_completed_date >= (now() at time zone 'utc')::date - (p_grace_days + 1);
$$;

grant execute on function public.streak_shield_covers_gap(date, boolean, integer)
  to service_role, authenticated, anon;

-- ────────────────────────────────────────────
-- 6. streak_is_alive — "a ofensiva ainda vale?", agora com o escudo guardado.
--    Vale se o último dia completo foi hoje/ontem (regra de sempre) OU se
--    há escudo guardado cobrindo o buraco.
-- ────────────────────────────────────────────
-- Assinatura muda (era `(date, date, integer)`), precisa do drop.
drop function if exists public.streak_is_alive(date, date, integer);

create function public.streak_is_alive(
  p_last_completed_date date,
  p_shield_armed        boolean,
  p_grace_days          integer
) returns boolean language sql immutable as $$
  select case
    when p_last_completed_date is null then false
    when p_last_completed_date >= (now() at time zone 'utc')::date - 1 then true
    else public.streak_shield_covers_gap(p_last_completed_date, p_shield_armed, p_grace_days)
  end;
$$;

grant execute on function public.streak_is_alive(date, boolean, integer)
  to service_role, authenticated, anon;

-- ────────────────────────────────────────────
-- 7. apply_aura_gain — considera o escudo guardado ao decidir se a ofensiva
--    conta para o multiplicador. Corpo idêntico ao de
--    20260930000003_restore_apply_aura_gain_vip_bonus_and_trust_tiers.sql,
--    só o cálculo de `v_streak_days` muda para a nova `streak_is_alive`.
-- ────────────────────────────────────────────
create or replace function public.apply_aura_gain(
  p_user_id     uuid,
  p_base_amount integer
) returns integer
language plpgsql security definer
set search_path = public as $$
declare
  v_streak_days    integer;
  v_streak_bps     integer;
  v_vip_bps        integer;
  v_bps            integer;
  v_bonus          integer;
  v_total          integer;
  v_account_tier   text;
  v_vip_expires_at timestamptz;
begin
  if p_base_amount <= 0 then
    return p_base_amount;
  end if;

  select case
    when public.streak_is_alive(
      s.last_completed_date,
      (sh.user_id is not null and sh.consumed_at is null),
      sh.grace_days
    )
    then s.current_streak
    else 0
  end into v_streak_days
  from public.user_streaks s
  left join public.user_streak_shields sh on sh.user_id = s.user_id
  where s.user_id = p_user_id;

  v_streak_days := coalesce(v_streak_days, 0);
  v_streak_bps := public.streak_aura_multiplier_bps(v_streak_days);

  select account_tier, vip_expires_at into v_account_tier, v_vip_expires_at
  from public.user_profiles
  where id = p_user_id;

  v_vip_bps := case
    when not public.is_vip_active(v_account_tier, v_vip_expires_at) then 0
    when v_streak_days > 0 then 25
    else 40
  end;

  v_bps := v_streak_bps + v_vip_bps;
  v_bonus := ceil(p_base_amount * v_bps / 10000.0)::integer;
  v_total := p_base_amount + v_bonus;

  insert into public.user_aura_wallet (user_id, balance) values (p_user_id, v_total)
    on conflict (user_id) do update
      set balance = greatest(user_aura_wallet.balance + v_total, 0), updated_at = now();

  return v_total;
end;
$$;

revoke execute on function public.apply_aura_gain(uuid, integer) from public, anon, authenticated;
grant execute on function public.apply_aura_gain(uuid, integer) to service_role;

-- ────────────────────────────────────────────
-- 8. complete_daily_mission — ao fechar as 3 missões e avançar a ofensiva,
--    se o buraco desde `last_completed_date` for coberto por um escudo
--    guardado, CONTINUA a sequência (prev + 1) em vez de reiniciar em 1, e
--    CONSOME o escudo (`consumed_at = now()`). Corpo idêntico ao de
--    20261004000000, só o bloco de avanço da ofensiva muda para a nova
--    regra `streak_shield_covers_gap`.
-- ────────────────────────────────────────────
create or replace function public.complete_daily_mission(
  p_user_id uuid,
  p_mission text
) returns table(all_completed boolean, streak integer)
language plpgsql security definer
set search_path = public as $$
declare
  v_date            date := (now() at time zone 'utc')::date;
  v_before          public.daily_missions%rowtype;
  v_after           public.daily_missions%rowtype;
  v_prev_date       date;
  v_prev_streak     integer;
  v_new_streak      integer;
  v_mission_reward  integer;
  v_shield_grace    integer;
  v_shield_armed    boolean := false;
  v_shield_saved    boolean := false;
begin
  if p_mission not in ('post', 'aura', 'comment') then
    raise exception 'invalid mission';
  end if;

  v_mission_reward := case p_mission
    when 'post' then 5
    when 'comment' then 3
    when 'aura' then 1
  end;

  insert into public.daily_missions (user_id, mission_date) values (p_user_id, v_date)
    on conflict (user_id, mission_date) do nothing;

  select * into v_before from public.daily_missions
    where user_id = p_user_id and mission_date = v_date for update;

  update public.daily_missions set
    created_post  = created_post  or (p_mission = 'post'),
    wrote_comment = wrote_comment or (p_mission = 'comment'),
    gave_aura     = gave_aura     or (p_mission = 'aura'),
    updated_at = now()
  where user_id = p_user_id and mission_date = v_date
  returning * into v_after;

  if (p_mission = 'post' and not v_before.created_post and v_after.created_post)
     or (p_mission = 'comment' and not v_before.wrote_comment and v_after.wrote_comment)
     or (p_mission = 'aura' and not v_before.gave_aura and v_after.gave_aura) then
    insert into public.user_aura_wallet (user_id, balance) values (p_user_id, v_mission_reward)
      on conflict (user_id) do update
        set balance = user_aura_wallet.balance + v_mission_reward, updated_at = now();

    insert into public.aura_ledger (user_id, delta, reason)
      values (p_user_id, v_mission_reward, 'daily_mission_completed');
  end if;

  if v_after.created_post and v_after.wrote_comment and v_after.gave_aura and not v_after.bonus_claimed then
    update public.daily_missions set bonus_claimed = true
      where user_id = p_user_id and mission_date = v_date;

    insert into public.user_aura_wallet (user_id, balance) values (p_user_id, 10)
      on conflict (user_id) do update
        set balance = user_aura_wallet.balance + 10, updated_at = now();

    insert into public.aura_ledger (user_id, delta, reason)
      values (p_user_id, 10, 'daily_streak_bonus');

    select last_completed_date, current_streak into v_prev_date, v_prev_streak
      from public.user_streaks where user_id = p_user_id;

    select grace_days, (consumed_at is null)
      into v_shield_grace, v_shield_armed
      from public.user_streak_shields where user_id = p_user_id for update;

    -- Buraco coberto pelo escudo guardado: `last_completed_date` é anterior
    -- a ontem (senão o `case` normal já resolve) mas não anterior a
    -- `hoje - (grace_days + 1)` — perdeu 1 dia e voltou dentro da margem.
    if coalesce(v_shield_armed, false)
       and v_prev_date is not null
       and v_prev_date <= v_date - 2
       and v_prev_date >= v_date - (coalesce(v_shield_grace, 1) + 1) then
      v_new_streak := coalesce(v_prev_streak, 0) + 1;
      v_shield_saved := true;
    else
      v_new_streak := case
        when v_prev_date = v_date - 1 then coalesce(v_prev_streak, 0) + 1
        when v_prev_date = v_date then coalesce(v_prev_streak, 1)
        else 1
      end;
    end if;

    insert into public.user_streaks (user_id, current_streak, longest_streak, last_completed_date)
    values (p_user_id, v_new_streak, v_new_streak, v_date)
    on conflict (user_id) do update set
      current_streak = v_new_streak,
      longest_streak = greatest(user_streaks.longest_streak, v_new_streak),
      last_completed_date = v_date,
      updated_at = now();

    -- Escudo cumpriu o papel — marca como consumido (cobre 1 buraco só).
    if v_shield_saved then
      update public.user_streak_shields
        set consumed_at = now()
        where user_id = p_user_id;
    end if;
  end if;

  return query
    select
      (v_after.created_post and v_after.wrote_comment and v_after.gave_aura),
      coalesce((select current_streak from public.user_streaks where user_id = p_user_id), 0);
end;
$$;

revoke execute on function public.complete_daily_mission(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_daily_mission(uuid, text) to service_role;
