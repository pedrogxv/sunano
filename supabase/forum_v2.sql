-- Forum v2 migration
-- Run this in the Supabase SQL editor.

-- 1. Add user_id to forum_posts (nullable for backward compat with anonymous posts)
alter table public.forum_posts
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists peripheral_refs uuid[] not null default '{}';

-- 2. Add user_id to forum_comments
alter table public.forum_comments
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists peripheral_refs uuid[] not null default '{}';

-- 3. Public user profiles (forum users, separate from admin_profiles)
create table if not exists public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create or replace function public.set_user_profiles_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_user_profiles_updated_at();

alter table public.user_profiles enable row level security;

-- Anyone can read profiles (for showing author info in forum)
create policy "User profiles are publicly readable"
  on public.user_profiles for select using (true);

-- Users can upsert their own profile
create policy "Users can manage their own profile"
  on public.user_profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 4. RLS: authenticated users can insert their own forum posts
-- (API routes use admin client for moderation; this policy covers direct SDK usage)
create policy "Authenticated users can create forum posts"
  on public.forum_posts for insert
  with check (auth.uid() = user_id);

-- 5. RLS: authenticated users can insert their own forum comments
create policy "Authenticated users can create forum comments"
  on public.forum_comments for insert
  with check (auth.uid() = user_id);

-- 6. Indexes for new columns
create index if not exists idx_forum_posts_user_id  on public.forum_posts(user_id);
create index if not exists idx_forum_comments_user_id on public.forum_comments(user_id);

-- -----------------------------------------------------------------------
-- Google OAuth setup checklist (document only — no SQL needed)
-- -----------------------------------------------------------------------
-- 1. Supabase Dashboard → Authentication → Providers → Google → Enable
-- 2. Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID
--      Application type: Web application
--      Authorized redirect URIs: https://<project>.supabase.co/auth/v1/callback
-- 3. Copy "Client ID" and "Client Secret" into Supabase → Google provider form
-- 4. In Supabase Dashboard → Authentication → URL Configuration:
--      Site URL:            https://yourdomain.com
--      Additional redirect: https://yourdomain.com/auth/callback
-- 5. For local dev add:     http://localhost:3000/auth/callback
-- -----------------------------------------------------------------------
