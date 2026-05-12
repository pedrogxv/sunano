-- Forum v3: sistema de votos + fixar posts
-- Execute no SQL editor do Supabase após forum_v2.sql

-- 1. Novas colunas em forum_posts
alter table public.forum_posts
  add column if not exists is_pinned  boolean not null default false,
  add column if not exists vote_score integer not null default 0;

-- 2. Tabela de votos
create table if not exists public.forum_votes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  post_id    uuid not null references public.forum_posts(id) on delete cascade,
  value      smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  unique(user_id, post_id)
);

alter table public.forum_votes enable row level security;

-- Usuários gerenciam apenas os próprios votos
create policy "Users manage their own votes"
  on public.forum_votes for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Trigger: mantém vote_score atualizado automaticamente
create or replace function public.sync_post_vote_score()
returns trigger language plpgsql as $$
declare
  target_id uuid;
begin
  target_id := coalesce(NEW.post_id, OLD.post_id);
  update public.forum_posts
     set vote_score = coalesce(
       (select sum(value) from public.forum_votes where post_id = target_id), 0
     )
   where id = target_id;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_sync_post_vote_score on public.forum_votes;
create trigger trg_sync_post_vote_score
  after insert or update or delete on public.forum_votes
  for each row execute function public.sync_post_vote_score();

-- 4. Índices
create index if not exists idx_forum_posts_hot
  on public.forum_posts(vote_score desc, created_at desc)
  where is_hidden = false;

create index if not exists idx_forum_posts_pinned
  on public.forum_posts(is_pinned, created_at desc)
  where is_pinned = true;

create index if not exists idx_forum_votes_post
  on public.forum_votes(post_id);

create index if not exists idx_forum_votes_user_post
  on public.forum_votes(user_id, post_id);

-- 5. Colunas geradas (stored) para preview nos feeds
-- Trunca o corpo em 280 chars para listagens, evitando trafegar o texto completo
alter table public.forum_posts
  add column if not exists body_preview text
  generated always as (left(body, 280)) stored;

alter table public.forum_comments
  add column if not exists body_preview text
  generated always as (left(body, 200)) stored;
