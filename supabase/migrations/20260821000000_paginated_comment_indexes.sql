-- Suporte a paginação server-side dos comentários públicos (blog e fórum),
-- com ordenação por "Mais Recente" (created_at) ou "Mais Aura" (aura_count).
-- Mesmo padrão do índice idx_forum_posts_hot_aura (20260808_forum_drop_legacy.sql).

create index if not exists idx_blog_comments_post_recent
  on public.blog_comments (post_id, created_at desc)
  where is_hidden = false;

create index if not exists idx_blog_comments_post_aura
  on public.blog_comments (post_id, aura_count desc, created_at desc)
  where is_hidden = false;

create index if not exists idx_forum_comments_post_recent
  on public.forum_comments (post_id, created_at desc)
  where is_hidden = false;

create index if not exists idx_forum_comments_post_aura
  on public.forum_comments (post_id, aura_count desc, created_at desc)
  where is_hidden = false;
