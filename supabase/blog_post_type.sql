-- Distingue Notícias de Reviews nos posts do blog.
-- Execute no SQL editor do Supabase. Idempotente: pode rodar mais de uma vez.
--
-- 'review' → vinculado a um periférico (comportamento atual; default).
-- 'news'   → notícia/anúncio, sem periférico obrigatório.

-- 1. Coluna de tipo. Posts existentes são todos reviews (tinham periférico).
alter table if exists public.blog_posts
  add column if not exists post_type text not null default 'review';

-- 2. Notícias não precisam de periférico — torna a coluna opcional.
alter table if exists public.blog_posts
  alter column peripheral_id drop not null;

-- 3. Ao apagar um periférico, preservar o post (set null) em vez de cascatear.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'blog_posts_peripheral_id_fkey'
  ) then
    alter table public.blog_posts drop constraint blog_posts_peripheral_id_fkey;
  end if;
  alter table public.blog_posts
    add constraint blog_posts_peripheral_id_fkey
    foreign key (peripheral_id)
    references public.peripherals(id)
    on delete set null;
end;
$$;

-- 4. Integridade: valores válidos e review obriga periférico.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'blog_posts_post_type_check'
  ) then
    alter table public.blog_posts
      add constraint blog_posts_post_type_check
      check (post_type in ('news', 'review'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'blog_posts_review_requires_peripheral_check'
  ) then
    alter table public.blog_posts
      add constraint blog_posts_review_requires_peripheral_check
      check (post_type <> 'review' or peripheral_id is not null);
  end if;
end;
$$;

create index if not exists idx_blog_posts_post_type on public.blog_posts(post_type);
