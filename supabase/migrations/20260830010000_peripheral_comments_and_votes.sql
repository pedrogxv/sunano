-- Comentários e votação ("BOM OU BAGRE?") na página de cada periférico —
-- mesma experiência de comentário do fórum (threads de até 4 níveis, Aura,
-- imagens, @menção, edição em 15min), mas em tabelas próprias
-- (`peripheral_comments` / `peripheral_aura` / `peripheral_votes`) em vez de
-- estender `forum_comments`/`forum_aura`: periférico é catálogo, não conteúdo
-- com "post" ou "autor", e manter tudo separado evita qualquer risco de
-- regressão nas funções já em produção (`toggle_forum_aura`,
-- `credit_comment_creation_aura`) usadas por fórum e blog. `apply_aura_gain`
-- e `complete_daily_mission` (genéricas, sem acoplamento a um tipo de
-- conteúdo) continuam sendo reaproveitadas como estão, sem alteração.
--
-- IMPORTANTE — aplicar manualmente via Supabase Dashboard (SQL Editor): o
-- histórico de migrations deste projeto está dessincronizado desde 04/08,
-- não rodar via `supabase db push`.

-- ────────────────────────────────────────────
-- 1. peripheral_comments — mesma forma de forum_comments/blog_comments.
-- ────────────────────────────────────────────
create table if not exists public.peripheral_comments (
  id                  uuid primary key default gen_random_uuid(),
  peripheral_id       uuid not null references public.peripherals(id) on delete cascade,
  body                text not null,
  body_preview        text generated always as (left(body, 140)) stored,
  author_name         text not null,
  user_id             uuid references auth.users(id) on delete set null,
  parent_comment_id   uuid references public.peripheral_comments(id) on delete cascade,
  is_hidden           boolean not null default false,
  aura_count          integer not null default 0,
  image_urls          text[] not null default '{}',
  mentioned_user_ids  uuid[] not null default '{}',
  edited_at           timestamptz,
  is_edited           boolean generated always as (edited_at is not null) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.peripheral_comments drop constraint if exists peripheral_comments_image_urls_limit;
alter table public.peripheral_comments
  add constraint peripheral_comments_image_urls_limit check (array_length(image_urls, 1) is null or array_length(image_urls, 1) <= 2);

alter table public.peripheral_comments drop constraint if exists peripheral_comments_mentions_limit;
alter table public.peripheral_comments
  add constraint peripheral_comments_mentions_limit check (array_length(mentioned_user_ids, 1) is null or array_length(mentioned_user_ids, 1) <= 2);

create index if not exists idx_peripheral_comments_parent on public.peripheral_comments (parent_comment_id);
create index if not exists idx_peripheral_comments_root_recent
  on public.peripheral_comments (peripheral_id, created_at desc) where parent_comment_id is null and is_hidden = false;
create index if not exists idx_peripheral_comments_root_aura
  on public.peripheral_comments (peripheral_id, aura_count desc, created_at desc) where parent_comment_id is null and is_hidden = false;

alter table public.peripheral_comments enable row level security;

-- Comentário é conteúdo público (mesma natureza de forum_comments) — leitura
-- liberada pra qualquer client; toda escrita passa pelas rotas de API com a
-- service role (sem policy de insert/update/delete pro client direto).
drop policy if exists "Peripheral comments are publicly readable" on public.peripheral_comments;
create policy "Peripheral comments are publicly readable"
  on public.peripheral_comments for select
  using (is_hidden = false);

create or replace function public.peripheral_comments_check_depth()
returns trigger language plpgsql as $$
declare
  v_depth int := 0;
  v_current uuid;
begin
  if new.parent_comment_id is not null then
    if new.parent_comment_id = new.id then
      raise exception 'peripheral_comments: um comentário não pode responder a si mesmo';
    end if;
    v_current := new.parent_comment_id;
    v_depth := 1;
    while v_current is not null loop
      select parent_comment_id into v_current
      from public.peripheral_comments where id = v_current;
      v_depth := v_depth + 1;
      if v_depth > 4 then
        raise exception 'peripheral_comments: máximo de 4 níveis de resposta';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_peripheral_comments_check_depth on public.peripheral_comments;
create trigger trg_peripheral_comments_check_depth
  before insert or update on public.peripheral_comments
  for each row execute function public.peripheral_comments_check_depth();

-- ────────────────────────────────────────────
-- 2. peripheral_aura — like/dislike (mutuamente exclusivo) em comentários de
--    periférico, mesmo desenho de `forum_aura` restrito ao alvo "comentário".
-- ────────────────────────────────────────────
create table if not exists public.peripheral_aura (
  id          uuid primary key default gen_random_uuid(),
  giver_id    uuid not null references auth.users(id) on delete cascade,
  comment_id  uuid not null references public.peripheral_comments(id) on delete cascade,
  kind        text not null check (kind in ('like', 'dislike')),
  created_at  timestamptz not null default now(),
  unique (giver_id, comment_id)
);

create index if not exists idx_peripheral_aura_comment on public.peripheral_aura (comment_id);

alter table public.peripheral_aura enable row level security;
-- Sem policy de select pública: só é lido via service role (lookup do
-- próprio usuário autenticado, feito nas rotas de API).

-- ────────────────────────────────────────────
-- 3. peripheral_votes — "BOM OU BAGRE?": voto binário por periférico (não
--    por comentário), sem autor pra creditar — o benefício de Aura vai pro
--    próprio eleitor, via missão diária (ver função abaixo).
-- ────────────────────────────────────────────
create table if not exists public.peripheral_votes (
  id             uuid primary key default gen_random_uuid(),
  peripheral_id  uuid not null references public.peripherals(id) on delete cascade,
  voter_id       uuid not null references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('like', 'dislike')),
  created_at     timestamptz not null default now(),
  unique (peripheral_id, voter_id)
);

create index if not exists idx_peripheral_votes_peripheral on public.peripheral_votes (peripheral_id);

alter table public.peripheral_votes enable row level security;
-- Sem policy de select pública: contagens agregadas e o voto do próprio
-- usuário são sempre lidos via service role nas rotas de API.

-- ────────────────────────────────────────────
-- 4. aura_ledger — novas colunas de origem + amplia o whitelist de `reason`
--    (lista completa hoje em `lib/database.types.ts`, só acrescentando os
--    5 motivos novos — ALTER só amplia o que já é aceito, nunca invalida
--    linha existente).
-- ────────────────────────────────────────────
alter table public.aura_ledger
  add column if not exists source_peripheral_id uuid references public.peripherals(id) on delete set null,
  add column if not exists source_peripheral_comment_id uuid references public.peripheral_comments(id) on delete set null;

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
    'daily_mission_completed', 'daily_streak_bonus', 'achievement_unlocked',
    'peripheral_comment_aura_received', 'peripheral_comment_aura_removed',
    'peripheral_comment_aura_disliked', 'peripheral_comment_aura_undisliked',
    'peripheral_comment_created'
  ));

-- Idempotência do bônus de "comentar pela 1ª vez neste periférico" (+5,
-- 1x por periférico por usuário) — mesmo espírito de
-- `aura_ledger_comment_created_unique` (20260804120000_aura_rebalance.sql).
create unique index if not exists aura_ledger_peripheral_comment_created_unique
  on public.aura_ledger (user_id, source_peripheral_id)
  where reason = 'peripheral_comment_created';

-- ────────────────────────────────────────────
-- 5. toggle_peripheral_comment_aura — like/dislike em comentário de
--    periférico, espelha o branch "comment" de `toggle_forum_aura`
--    (20260828_streak_aura_multiplier.sql): "like" passa pelo multiplicador
--    de streak via `apply_aura_gain`, undo/dislike/troca ajustam a wallet
--    pelo delta líquido direto (estorno, sem bônus).
-- ────────────────────────────────────────────
create or replace function public.toggle_peripheral_comment_aura(
  p_giver_id   uuid,
  p_comment_id uuid,
  p_kind       text default 'like'
) returns table(reaction text, aura_count integer)
language plpgsql security definer
set search_path = public as $$
declare
  v_author_id     uuid;
  v_existing_kind text;
  v_new_count     integer;
  v_given_today   integer;
  v_count_delta   integer;
  v_ledger_reason text;
  v_credited      integer;
begin
  if p_kind not in ('like', 'dislike') then
    raise exception 'invalid kind';
  end if;

  select user_id into v_author_id from public.peripheral_comments where id = p_comment_id for update;
  if v_author_id is null then
    raise exception 'target not found or has no author';
  end if;
  if v_author_id = p_giver_id then
    raise exception 'self_aura_not_allowed';
  end if;

  select kind into v_existing_kind
  from public.peripheral_aura where giver_id = p_giver_id and comment_id = p_comment_id;

  if v_existing_kind is null then
    select count(*) into v_given_today
    from public.aura_ledger
    where giver_id = p_giver_id
      and created_at >= now() - interval '24 hours'
      and reason in ('peripheral_comment_aura_received', 'peripheral_comment_aura_disliked');
    if v_given_today >= 50 then
      raise exception 'daily_aura_limit_reached';
    end if;

    insert into public.peripheral_aura (giver_id, comment_id, kind) values (p_giver_id, p_comment_id, p_kind);

    v_count_delta := case when p_kind = 'like' then 1 else -1 end;
    v_ledger_reason := case when p_kind = 'like' then 'peripheral_comment_aura_received' else 'peripheral_comment_aura_disliked' end;

    if p_kind = 'like' then
      v_credited := public.apply_aura_gain(v_author_id, v_count_delta);
      insert into public.aura_ledger (user_id, delta, reason, source_peripheral_comment_id, giver_id)
      values (v_author_id, v_credited, v_ledger_reason, p_comment_id, p_giver_id);
    else
      insert into public.aura_ledger (user_id, delta, reason, source_peripheral_comment_id, giver_id)
      values (v_author_id, v_count_delta, v_ledger_reason, p_comment_id, p_giver_id);
      insert into public.user_aura_wallet (user_id, balance) values (v_author_id, greatest(v_count_delta, 0))
        on conflict (user_id) do update
          set balance = greatest(user_aura_wallet.balance + v_count_delta, 0), updated_at = now();
    end if;

  elsif v_existing_kind = p_kind then
    -- Desfaz (undo): estorno do que foi dado, sem multiplicador.
    delete from public.peripheral_aura where giver_id = p_giver_id and comment_id = p_comment_id;

    v_count_delta := case when p_kind = 'like' then -1 else 1 end;
    v_ledger_reason := case when p_kind = 'like' then 'peripheral_comment_aura_removed' else 'peripheral_comment_aura_undisliked' end;

    insert into public.aura_ledger (user_id, delta, reason, source_peripheral_comment_id, giver_id)
    values (v_author_id, v_count_delta, v_ledger_reason, p_comment_id, p_giver_id);

    update public.user_aura_wallet
      set balance = greatest(balance + v_count_delta, 0), updated_at = now()
      where user_id = v_author_id;

    p_kind := null;

  else
    -- Troca like<->dislike: sem multiplicador (ajuste líquido, não ganho novo).
    select count(*) into v_given_today
    from public.aura_ledger
    where giver_id = p_giver_id
      and created_at >= now() - interval '24 hours'
      and reason in ('peripheral_comment_aura_received', 'peripheral_comment_aura_disliked');
    if v_given_today >= 50 then
      raise exception 'daily_aura_limit_reached';
    end if;

    update public.peripheral_aura set kind = p_kind where giver_id = p_giver_id and comment_id = p_comment_id;

    v_count_delta := case when v_existing_kind = 'like' then -1 else 1 end;
    v_ledger_reason := case when v_existing_kind = 'like' then 'peripheral_comment_aura_removed' else 'peripheral_comment_aura_undisliked' end;
    insert into public.aura_ledger (user_id, delta, reason, source_peripheral_comment_id, giver_id)
    values (v_author_id, v_count_delta, v_ledger_reason, p_comment_id, p_giver_id);

    v_count_delta := case when p_kind = 'like' then 2 else -2 end;
    v_ledger_reason := case when p_kind = 'like' then 'peripheral_comment_aura_received' else 'peripheral_comment_aura_disliked' end;
    insert into public.aura_ledger (user_id, delta, reason, source_peripheral_comment_id, giver_id)
    values (v_author_id, v_count_delta, v_ledger_reason, p_comment_id, p_giver_id);

    update public.user_aura_wallet
      set balance = greatest(balance + v_count_delta, 0), updated_at = now()
      where user_id = v_author_id;
  end if;

  update public.peripheral_comments set aura_count = peripheral_comments.aura_count + v_count_delta where id = p_comment_id
    returning peripheral_comments.aura_count into v_new_count;

  return query select p_kind, v_new_count;
end;
$$;

revoke execute on function public.toggle_peripheral_comment_aura(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_peripheral_comment_aura(uuid, uuid, text) to service_role;

-- ────────────────────────────────────────────
-- 6. credit_peripheral_comment_creation_aura — +5 de aura por comentar,
--    1x por periférico por usuário. Mesmo padrão de idempotência de
--    `credit_comment_creation_aura` (índice único parcial do ledger).
-- ────────────────────────────────────────────
create or replace function public.credit_peripheral_comment_creation_aura(
  p_user_id       uuid,
  p_peripheral_id uuid
) returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_inserted integer;
  v_credited integer;
begin
  v_credited := public.apply_aura_gain(p_user_id, 5);

  insert into public.aura_ledger (user_id, delta, reason, source_peripheral_id)
  values (p_user_id, v_credited, 'peripheral_comment_created', p_peripheral_id)
  on conflict (user_id, source_peripheral_id) where reason = 'peripheral_comment_created' do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    -- Já premiado antes: desfaz o crédito que apply_aura_gain já aplicou na
    -- wallet, já que o ledger (fonte da verdade de idempotência) não gravou.
    update public.user_aura_wallet
      set balance = greatest(balance - v_credited, 0), updated_at = now()
      where user_id = p_user_id;
    return false;
  end if;

  return true;
end;
$$;

revoke execute on function public.credit_peripheral_comment_creation_aura(uuid, uuid) from public, anon, authenticated;
grant execute on function public.credit_peripheral_comment_creation_aura(uuid, uuid) to service_role;

-- ────────────────────────────────────────────
-- 7. toggle_peripheral_vote — "BOM OU BAGRE?": like/dislike por periférico,
--    mutuamente exclusivo. Periférico não tem autor pra creditar aura — quem
--    ganha é o próprio eleitor, no primeiro voto (qualquer categoria), via a
--    missão diária "aura" já existente (mesma que curtir comentário
--    credita), 1x/dia no total — sem checagem de limite adicional aqui
--    porque `complete_daily_mission` já é idempotente por dia.
-- ────────────────────────────────────────────
create or replace function public.toggle_peripheral_vote(
  p_voter_id      uuid,
  p_peripheral_id uuid,
  p_kind          text
) returns table(reaction text, likes integer, dislikes integer)
language plpgsql security definer
set search_path = public as $$
declare
  v_exists_peripheral boolean;
  v_existing_kind     text;
  v_likes             integer;
  v_dislikes          integer;
begin
  if p_kind not in ('like', 'dislike') then
    raise exception 'invalid kind';
  end if;

  select exists(select 1 from public.peripherals where id = p_peripheral_id) into v_exists_peripheral;
  if not v_exists_peripheral then
    raise exception 'target not found';
  end if;

  select kind into v_existing_kind
  from public.peripheral_votes where voter_id = p_voter_id and peripheral_id = p_peripheral_id;

  if v_existing_kind is null then
    insert into public.peripheral_votes (voter_id, peripheral_id, kind) values (p_voter_id, p_peripheral_id, p_kind);
    perform public.complete_daily_mission(p_voter_id, 'aura');
  elsif v_existing_kind = p_kind then
    delete from public.peripheral_votes where voter_id = p_voter_id and peripheral_id = p_peripheral_id;
    p_kind := null;
  else
    update public.peripheral_votes set kind = p_kind where voter_id = p_voter_id and peripheral_id = p_peripheral_id;
  end if;

  select count(*) filter (where kind = 'like'), count(*) filter (where kind = 'dislike')
    into v_likes, v_dislikes
    from public.peripheral_votes where peripheral_id = p_peripheral_id;

  return query select p_kind, v_likes, v_dislikes;
end;
$$;

revoke execute on function public.toggle_peripheral_vote(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_peripheral_vote(uuid, uuid, text) to service_role;
