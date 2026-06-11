-- Comentários das notícias (blog_posts) com conta de usuário.
-- Execute no SQL editor do Supabase. Espelha o modelo de `forum_comments`,
-- mas vinculado a `blog_posts` em vez de `forum_posts`.

create table if not exists public.blog_comments (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.blog_posts(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  body          text not null,
  author_name   text not null,
  is_hidden     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_blog_comments_post_id on public.blog_comments(post_id);
create index if not exists idx_blog_comments_user_id on public.blog_comments(user_id);
create index if not exists idx_blog_comments_created_at on public.blog_comments(created_at desc);

-- Preview truncado para listagens/moderação.
alter table public.blog_comments
  add column if not exists body_preview text
  generated always as (left(body, 200)) stored;

create or replace function public.set_blog_comments_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_blog_comments_updated_at on public.blog_comments;
create trigger trg_blog_comments_updated_at
  before update on public.blog_comments
  for each row execute function public.set_blog_comments_updated_at();

alter table public.blog_comments enable row level security;

-- Qualquer um pode ler comentários visíveis (autor é exibido na notícia).
create policy "Blog comments are publicly readable"
  on public.blog_comments for select
  using (is_hidden = false);

-- Usuários autenticados criam apenas comentários em seu próprio nome.
-- (As rotas de API usam o admin client; esta policy cobre o uso direto do SDK.)
create policy "Authenticated users can create blog comments"
  on public.blog_comments for insert
  with check (auth.uid() = user_id);
