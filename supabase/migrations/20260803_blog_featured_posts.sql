-- Permite destacar manualmente até 3 notícias no header de manchetes de /noticias.
alter table if exists public.blog_posts
  add column if not exists is_featured boolean not null default false;

create index if not exists idx_blog_posts_featured
  on public.blog_posts(is_featured, created_at desc)
  where is_featured = true;
