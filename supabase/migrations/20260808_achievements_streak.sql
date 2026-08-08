-- Conquistas gerais (Posts/Comentários/Seguidores x 5 níveis), missões
-- diárias e ofensiva (streak).
--
-- Reaproveita a carteira de Aura já existente (`user_aura_wallet`/
-- `aura_ledger`, ver 20260806_forum_aura.sql e 20260804120000_aura_rebalance.sql)
-- para as recompensas — nenhuma moeda nova.

-- ────────────────────────────────────────────
-- 1. Categoriza o catálogo de medalhas existente: 'event' pra quem é
--    concedida via `events` (campanhas administradas em /admin/eventos,
--    ex.: "ERA TUDO MATO"), 'general' pro resto (pioneiro, colecionador etc.
--    e as novas conquistas de posts/comentários/seguidores abaixo).
-- ────────────────────────────────────────────
alter table public.medals
  add column if not exists category text not null default 'general'
    check (category in ('general', 'event'));

update public.medals set category = 'event'
where id in (select medal_id from public.events);

-- ────────────────────────────────────────────
-- 2. Catálogo de conquistas gerais — 3 trilhas x 5 níveis, progressão por
--    contador simples (não por medalha manual como `medals`/`events`).
-- ────────────────────────────────────────────
create table if not exists public.achievements (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  track       text not null check (track in ('posts', 'comments', 'followers')),
  tier        text not null check (tier in ('bronze', 'silver', 'gold', 'platinum', 'diamond')),
  threshold   integer not null check (threshold > 0),
  name        text not null,
  description text,
  aura_reward integer not null default 0 check (aura_reward >= 0),
  created_at  timestamptz not null default now(),
  unique (track, tier)
);

alter table public.achievements enable row level security;

drop policy if exists "Achievements are publicly readable" on public.achievements;
create policy "Achievements are publicly readable"
  on public.achievements for select using (true);

create table if not exists public.user_achievements (
  user_id        uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  awarded_at     timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index if not exists idx_user_achievements_user on public.user_achievements(user_id);

alter table public.user_achievements enable row level security;

drop policy if exists "User achievements are publicly readable" on public.user_achievements;
create policy "User achievements are publicly readable"
  on public.user_achievements for select using (true);

-- Sem policy de insert: concedida só pela função `check_and_award_track_achievements`
-- abaixo (service-role), mesma postura de `user_medals`.

insert into public.achievements (slug, track, tier, threshold, name, description, aura_reward) values
  ('posts_bronze',      'posts',     'bronze',   1,    'Nível Bronze',   '1 post publicado no fórum.',        10),
  ('posts_silver',      'posts',     'silver',   10,   'Nível Prata',    '10 posts publicados no fórum.',      25),
  ('posts_gold',        'posts',     'gold',     50,   'Nível Ouro',     '50 posts publicados no fórum.',      50),
  ('posts_platinum',    'posts',     'platinum', 100,  'Nível Platina',  '100 posts publicados no fórum.',     100),
  ('posts_diamond',     'posts',     'diamond',  1000, 'Nível Diamante', '1000 posts publicados no fórum.',    250),

  ('comments_bronze',   'comments',  'bronze',   1,    'Nível Bronze',   '1 comentário no fórum.',             10),
  ('comments_silver',   'comments',  'silver',   10,   'Nível Prata',    '10 comentários no fórum.',           25),
  ('comments_gold',     'comments',  'gold',     50,   'Nível Ouro',     '50 comentários no fórum.',           50),
  ('comments_platinum', 'comments',  'platinum', 100,  'Nível Platina',  '100 comentários no fórum.',          100),
  ('comments_diamond',  'comments',  'diamond',  1000, 'Nível Diamante', '1000 comentários no fórum.',         250),

  ('followers_bronze',   'followers', 'bronze',   1,    'Astro',         '1 seguidor.',                       10),
  ('followers_silver',   'followers', 'silver',   10,   'Ídolo',         '10 seguidores.',                     25),
  ('followers_gold',     'followers', 'gold',     50,   'Famosinho',     '50 seguidores.',                     50),
  ('followers_platinum', 'followers', 'platinum', 100,  'Celebridade',   '100 seguidores.',                    100),
  ('followers_diamond',  'followers', 'diamond',  1000, 'Lenda',         '1000 seguidores.',                   250)
on conflict (slug) do nothing;

-- ────────────────────────────────────────────
-- 3. Missões diárias + ofensiva ("virada do dia" às 00:00 GMT+0 = data UTC).
-- ────────────────────────────────────────────
create table if not exists public.daily_missions (
  user_id       uuid not null references auth.users(id) on delete cascade,
  mission_date  date not null,
  created_post  boolean not null default false,
  gave_aura     boolean not null default false,
  wrote_comment boolean not null default false,
  bonus_claimed boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (user_id, mission_date)
);

create index if not exists idx_daily_missions_user_date on public.daily_missions(user_id, mission_date desc);

alter table public.daily_missions enable row level security;

drop policy if exists "Users read their own daily missions" on public.daily_missions;
create policy "Users read their own daily missions"
  on public.daily_missions for select using (auth.uid() = user_id);

create table if not exists public.user_streaks (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  current_streak       integer not null default 0 check (current_streak >= 0),
  longest_streak       integer not null default 0 check (longest_streak >= 0),
  last_completed_date  date,
  updated_at           timestamptz not null default now()
);

alter table public.user_streaks enable row level security;

-- Pública: a ofensiva aparece no perfil, mini-perfil e comentários de
-- qualquer usuário, não só do dono.
drop policy if exists "Streaks are publicly readable" on public.user_streaks;
create policy "Streaks are publicly readable"
  on public.user_streaks for select using (true);

-- ────────────────────────────────────────────
-- 4. Novos motivos no extrato de aura (mesmo padrão de
--    20260818_blog_aura_and_threads.sql: redefine o check com a lista
--    completa vigente + os 2 motivos novos).
-- ────────────────────────────────────────────
-- Lista completa vigente até aqui (ver lib/database.types.ts, mantido à mão
-- e mais atual que a última migration que redefiniu este check) + os 3
-- motivos novos deste arquivo.
alter table public.aura_ledger
  drop constraint if exists aura_ledger_reason_check,
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
    'daily_mission_completed', 'daily_streak_bonus', 'achievement_unlocked'
  ));

-- ────────────────────────────────────────────
-- 5. check_and_award_track_achievements — compara o contador atual contra
--    os limiares da trilha e concede (+credita aura) as que faltam, numa
--    chamada só. Idempotente via `on conflict do nothing`.
-- ────────────────────────────────────────────
create or replace function public.check_and_award_track_achievements(
  p_user_id uuid,
  p_track   text,
  p_count   integer
) returns void language plpgsql security definer
set search_path = public as $$
declare
  v_achievement record;
begin
  for v_achievement in
    select a.id, a.aura_reward
    from public.achievements a
    where a.track = p_track
      and a.threshold <= p_count
      and not exists (
        select 1 from public.user_achievements ua
        where ua.user_id = p_user_id and ua.achievement_id = a.id
      )
  loop
    insert into public.user_achievements (user_id, achievement_id)
    values (p_user_id, v_achievement.id)
    on conflict (user_id, achievement_id) do nothing;

    if v_achievement.aura_reward > 0 then
      insert into public.user_aura_wallet (user_id, balance)
      values (p_user_id, v_achievement.aura_reward)
      on conflict (user_id) do update
        set balance = user_aura_wallet.balance + v_achievement.aura_reward, updated_at = now();

      insert into public.aura_ledger (user_id, delta, reason)
      values (p_user_id, v_achievement.aura_reward, 'achievement_unlocked');
    end if;
  end loop;
end;
$$;

revoke execute on function public.check_and_award_track_achievements(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.check_and_award_track_achievements(uuid, text, integer) to service_role;

-- ────────────────────────────────────────────
-- 6. complete_daily_mission — marca 1 das 3 missões do dia (post/comentário/
--    aura), credita +5 na primeira vez que ela vira true no dia, e quando as
--    3 fecham credita +10 de bônus e avança a ofensiva.
--
--    Ofensiva: se o último dia completo foi ontem, incrementa; se foi hoje
--    (já processado), mantém; qualquer outra coisa (ou nunca completou),
--    reinicia em 1. Não existe job de "zerar à meia-noite" — um dia perdido
--    sem completar as 3 simplesmente não avança `last_completed_date`, e a
--    leitura (`getUserStreak` no app) trata `current_streak` como expirado
--    quando `last_completed_date < hoje - 1`.
-- ────────────────────────────────────────────
create or replace function public.complete_daily_mission(
  p_user_id uuid,
  p_mission text -- 'post' | 'aura' | 'comment'
) returns table(all_completed boolean, streak integer)
language plpgsql security definer
set search_path = public as $$
declare
  v_date       date := (now() at time zone 'utc')::date;
  v_before     public.daily_missions%rowtype;
  v_after      public.daily_missions%rowtype;
  v_prev_date  date;
  v_prev_streak integer;
  v_new_streak integer;
begin
  if p_mission not in ('post', 'aura', 'comment') then
    raise exception 'invalid mission';
  end if;

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

  -- +5 só na transição false -> true da missão específica (evita creditar de novo em toggles repetidos no mesmo dia).
  if (p_mission = 'post' and not v_before.created_post and v_after.created_post)
     or (p_mission = 'comment' and not v_before.wrote_comment and v_after.wrote_comment)
     or (p_mission = 'aura' and not v_before.gave_aura and v_after.gave_aura) then
    insert into public.user_aura_wallet (user_id, balance) values (p_user_id, 5)
      on conflict (user_id) do update set balance = user_aura_wallet.balance + 5, updated_at = now();
    insert into public.aura_ledger (user_id, delta, reason) values (p_user_id, 5, 'daily_mission_completed');
  end if;

  if v_after.created_post and v_after.wrote_comment and v_after.gave_aura and not v_after.bonus_claimed then
    update public.daily_missions set bonus_claimed = true
      where user_id = p_user_id and mission_date = v_date;

    insert into public.user_aura_wallet (user_id, balance) values (p_user_id, 10)
      on conflict (user_id) do update set balance = user_aura_wallet.balance + 10, updated_at = now();
    insert into public.aura_ledger (user_id, delta, reason) values (p_user_id, 10, 'daily_streak_bonus');

    select last_completed_date, current_streak into v_prev_date, v_prev_streak
      from public.user_streaks where user_id = p_user_id;

    v_new_streak := case
      when v_prev_date = v_date - 1 then coalesce(v_prev_streak, 0) + 1
      when v_prev_date = v_date then coalesce(v_prev_streak, 1)
      else 1
    end;

    insert into public.user_streaks (user_id, current_streak, longest_streak, last_completed_date)
    values (p_user_id, v_new_streak, v_new_streak, v_date)
    on conflict (user_id) do update set
      current_streak = v_new_streak,
      longest_streak = greatest(user_streaks.longest_streak, v_new_streak),
      last_completed_date = v_date,
      updated_at = now();
  end if;

  return query
    select
      (v_after.created_post and v_after.wrote_comment and v_after.gave_aura),
      coalesce((select current_streak from public.user_streaks where user_id = p_user_id), 0);
end;
$$;

revoke execute on function public.complete_daily_mission(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_daily_mission(uuid, text) to service_role;
