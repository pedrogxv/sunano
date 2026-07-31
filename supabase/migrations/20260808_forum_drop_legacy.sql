-- Remove o que fica obsoleto depois da reformulação do fórum (categorias +
-- aura). Só é seguro rodar depois que repository/API/UI já não referenciam
-- mais `title`/`peripheral_refs`/`vote_score`/`forum_votes` — ver ordem de
-- execução no plano de implementação.

drop trigger if exists trg_sync_post_vote_score on public.forum_votes;
drop function if exists public.sync_post_vote_score();
drop table if exists public.forum_votes;

-- Índice de "em alta" antigo dependia de vote_score; substituído pelo
-- equivalente em aura_count (criada em 20260806_forum_aura.sql).
drop index if exists idx_forum_posts_hot;
create index if not exists idx_forum_posts_hot_aura
  on public.forum_posts (aura_count desc, created_at desc)
  where is_hidden = false;

alter table public.forum_posts
  drop column if exists title,
  drop column if exists peripheral_refs,
  drop column if exists vote_score;

alter table public.forum_comments
  drop column if exists peripheral_refs;

-- Nota: `anonymize_user_data` (20260731_drop_forum_author_email.sql) só
-- mexe em `author_name`, não em `title`/`peripheral_refs` — não precisa de
-- ajuste aqui.
