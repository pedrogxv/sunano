-- Proteção de Ofensiva — "escudo de streak" comprável com Aura. Segura a
-- ofensiva viva por N dias corridos mesmo que o usuário perca um dia de
-- missões. Um só card na Central de Aura com toggle 1 dia / 3 dias — dois
-- itens no catálogo `aura_items` (kind='streak_shield'), o frontend escolhe
-- o id conforme a variante.
--
-- Mesmo padrão de `purchase_vip_with_aura`
-- (20260921130003_aura_vip_and_display_name.sql): toda a atomicidade da
-- compra (checar item ativo, barrar stack, debitar a wallet, gravar o
-- escudo, lançar no extrato) vive numa função `security definer` com locks
-- via `select ... for update` — é Aura (dinheiro) envolvida, nunca confiar
-- só no client.
--
-- A "janela de graça" NÃO tem job noturno: `isStreakActive`
-- (achievements-repository.ts) e `apply_aura_gain` já tratam a expiração da
-- ofensiva na leitura comparando `last_completed_date` com hoje/ontem; este
-- arquivo só ESTENDE essa comparação para "…ou o escudo cobre o buraco".
-- O escudo é consumido (linha zerada) na 1ª vez que `complete_daily_mission`
-- roda depois do buraco — cobre um buraco só, nunca dois.

-- ────────────────────────────────────────────
-- 1. Tabela do escudo por usuário
-- ────────────────────────────────────────────
create table if not exists public.user_streak_shields (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  -- Último dia (UTC, inclusive) em que a ofensiva fica protegida mesmo sem
  -- completar as missões. Escudo "ativo" = protected_until >= hoje (UTC).
  protected_until date not null,
  -- Duração comprada (1 ou 3) — só informativo/telemetria.
  days            integer not null check (days > 0),
  source_item_slug text not null,
  activated_at    timestamptz not null default now()
);

alter table public.user_streak_shields enable row level security;

-- Pública como `user_streaks`: o estado "ofensiva congelada" aparece no
-- perfil/mini-perfil/comentários de qualquer um, não só do dono. Escrita só
-- via RPC (`purchase_streak_shield` / `complete_daily_mission`), sem policy
-- de insert/update/delete direta — mesmo padrão de `user_aura_items`.
drop policy if exists "Streak shields are publicly readable" on public.user_streak_shields;
create policy "Streak shields are publicly readable"
  on public.user_streak_shields for select using (true);

-- ────────────────────────────────────────────
-- 2. Novo kind em aura_items + reason no extrato
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
-- 3. Seed das duas variantes no catálogo
-- ────────────────────────────────────────────
insert into public.aura_items (slug, name, description, kind, image_url, frame_asset_url, aura_cost, active, sort_order)
values
  (
    'protecao-ofensiva-1d',
    'Proteção de Ofensiva — 1 dia',
    'Congela sua ofensiva por 1 dia: se perder um dia de missões, você não perde a sequência.',
    'streak_shield',
    null,
    -- `frame_asset_url` é `not null` na tabela mas só faz sentido para
    -- kind=avatar_frame; string vazia só satisfaz a coluna.
    '',
    59,
    true,
    -4
  ),
  (
    'protecao-ofensiva-3d',
    'Proteção de Ofensiva — 3 dias',
    'Congela sua ofensiva por 3 dias corridos: se perder dias de missões nesse período, você não perde a sequência.',
    'streak_shield',
    null,
    '',
    199,
    true,
    -3
  )
on conflict (slug) do nothing;

-- ────────────────────────────────────────────
-- 4. purchase_streak_shield — compra 1 variante do escudo
-- ────────────────────────────────────────────
create or replace function public.purchase_streak_shield(p_user_id uuid, p_item_id uuid)
returns date language plpgsql security definer
set search_path = public as $$
declare
  v_aura_cost integer;
  v_active    boolean;
  v_kind      text;
  v_slug      text;
  v_days      integer;
  v_date      date := (now() at time zone 'utc')::date;
  v_existing  date;
  v_until     date;
begin
  select aura_cost, active, kind, slug into v_aura_cost, v_active, v_kind, v_slug
  from public.aura_items
  where id = p_item_id
  for update;

  if not found or not v_active or v_kind <> 'streak_shield' then
    raise exception 'item_unavailable';
  end if;

  v_days := case v_slug
    when 'protecao-ofensiva-1d' then 1
    when 'protecao-ofensiva-3d' then 3
    else null
  end;
  if v_days is null then
    raise exception 'item_unavailable';
  end if;

  -- Lock na linha do escudo: barra duplo-clique comprando 2x antes do
  -- primeiro commit E garante que "já tem escudo ativo?" é atômico com o
  -- débito. Sem stack: enquanto `protected_until >= hoje` não recompra.
  select protected_until into v_existing
  from public.user_streak_shields
  where user_id = p_user_id
  for update;

  if v_existing is not null and v_existing >= v_date then
    raise exception 'shield_already_active';
  end if;

  update public.user_aura_wallet
  set balance = balance - v_aura_cost, updated_at = now()
  where user_id = p_user_id and balance >= v_aura_cost;

  if not found then
    raise exception 'insufficient_aura_balance';
  end if;

  v_until := v_date + (v_days - 1);

  insert into public.user_streak_shields (user_id, protected_until, days, source_item_slug, activated_at)
  values (p_user_id, v_until, v_days, v_slug, now())
  on conflict (user_id) do update set
    protected_until = excluded.protected_until,
    days = excluded.days,
    source_item_slug = excluded.source_item_slug,
    activated_at = now();

  insert into public.aura_ledger (user_id, delta, reason)
  values (p_user_id, -v_aura_cost, 'streak_shield_purchased');

  return v_until;
end;
$$;

revoke execute on function public.purchase_streak_shield(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purchase_streak_shield(uuid, uuid) to service_role;

-- ────────────────────────────────────────────
-- 5. streak_is_alive — regra única de "a ofensiva ainda vale?", com escudo.
--    Espelhada em `isStreakActive` (achievements-repository.ts).
--
--    Vale se o último dia completo foi hoje/ontem (regra de sempre) OU se
--    havia escudo cobrindo o buraco: `last_completed_date` não pode ser
--    anterior ao dia seguinte ao início da cobertura. Como só guardamos
--    `protected_until` (fim) e `days` (duração), o início é
--    `protected_until - (days - 1)`; a ofensiva sobrevive se
--    `last_completed_date >= (protected_until - days)` — i.e. o buraco
--    começa dentro (ou na véspera) da janela do escudo — e o escudo ainda
--    não expirou de vez (`protected_until >= ontem`, para o dia em que ele
--    for finalmente consumido ainda contar).
-- ────────────────────────────────────────────
create or replace function public.streak_is_alive(
  p_last_completed_date date,
  p_protected_until      date,
  p_shield_days          integer
) returns boolean language sql immutable as $$
  select case
    when p_last_completed_date is null then false
    when p_last_completed_date >= (now() at time zone 'utc')::date - 1 then true
    when p_protected_until is null then false
    -- Escudo cobre o buraco: a última data completa é no máximo 1 dia antes
    -- do começo da janela, e a janela ainda alcança ontem.
    when p_protected_until >= (now() at time zone 'utc')::date - 1
      and p_last_completed_date >= p_protected_until - coalesce(p_shield_days, 1)
      then true
    else false
  end;
$$;

grant execute on function public.streak_is_alive(date, date, integer) to service_role, authenticated, anon;

-- ────────────────────────────────────────────
-- 6. apply_aura_gain — passa a considerar o escudo ao decidir se a ofensiva
--    conta para o multiplicador. Corpo idêntico ao de
--    20260930000003_restore_apply_aura_gain_vip_bonus_and_trust_tiers.sql,
--    só o cálculo de `v_streak_days` muda para usar `streak_is_alive`.
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
    when public.streak_is_alive(s.last_completed_date, sh.protected_until, sh.days)
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
-- 7. complete_daily_mission — ao fechar as 3 missões e avançar a ofensiva,
--    se o buraco desde `last_completed_date` estava coberto por um escudo,
--    CONTINUA a sequência (prev + 1) em vez de reiniciar em 1, e CONSOME o
--    escudo (apaga a linha). Corpo idêntico ao de
--    20260930000000_aura_fixed_rewards.sql, só o bloco de avanço da
--    ofensiva muda.
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
  v_shield_until    date;
  v_shield_days     integer;
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

    select protected_until, days into v_shield_until, v_shield_days
      from public.user_streak_shields where user_id = p_user_id for update;

    -- Buraco coberto pelo escudo: `last_completed_date` é anterior a ontem
    -- (senão o `case` normal já resolve) mas não anterior ao começo da
    -- janela do escudo, e a janela ainda alcança ontem.
    if v_prev_date is not null
       and v_prev_date < v_date - 1
       and v_shield_until is not null
       and v_shield_until >= v_date - 1
       and v_prev_date >= v_shield_until - coalesce(v_shield_days, 1) then
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

    -- Escudo cumpriu o papel — consome (some a linha), cobre 1 buraco só.
    if v_shield_saved then
      delete from public.user_streak_shields where user_id = p_user_id;
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
