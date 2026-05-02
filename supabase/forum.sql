-- Forum tables and anti-spam support

create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  body text not null,
  author_name text not null,
  author_email text,
  is_hidden boolean not null default false,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forum_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  body text not null,
  author_name text not null,
  author_email text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  identifier text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.offers_votes (
  id uuid primary key default gen_random_uuid(),
  offer_id text not null,
  voter_hash text not null,
  is_working boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_offers_votes_unique on public.offers_votes(offer_id, voter_hash);
create index if not exists idx_offers_votes_offer_id on public.offers_votes(offer_id);

create index if not exists idx_forum_posts_created_at on public.forum_posts(created_at desc);
create index if not exists idx_forum_comments_post_id on public.forum_comments(post_id);
create index if not exists idx_rate_limit_action_identifier on public.rate_limit_events(action, identifier, created_at desc);

create or replace function public.set_forum_posts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_forum_posts_updated_at on public.forum_posts;
create trigger trg_forum_posts_updated_at
before update on public.forum_posts
for each row
execute function public.set_forum_posts_updated_at();

create or replace function public.set_forum_comments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_forum_comments_updated_at on public.forum_comments;
create trigger trg_forum_comments_updated_at
before update on public.forum_comments
for each row
execute function public.set_forum_comments_updated_at();

alter table if exists public.forum_posts enable row level security;
alter table if exists public.forum_comments enable row level security;
alter table if exists public.rate_limit_events enable row level security;
alter table if exists public.offers_votes enable row level security;

create policy "Forum posts are publicly readable"
on public.forum_posts
for select
using (is_hidden = false);

create policy "Forum comments are publicly readable"
on public.forum_comments
for select
using (is_hidden = false);

create policy "Rate limit events are private"
on public.rate_limit_events
for select
using (false);

create policy "Offers votes are publicly readable"
on public.offers_votes
for select
using (true);
