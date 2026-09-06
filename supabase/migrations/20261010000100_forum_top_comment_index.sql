-- Índice dedicado ao "comentário destaque" da listagem do fórum
-- (get_forum_posts_comment_summary, 20261010000000).
--
-- O índice que já existia mais próximo, `idx_forum_comments_post_aura`
-- (post_id, aura_count desc, created_at desc) where is_hidden = false, não
-- cobre o predicado `parent_comment_id is null` do destaque — na prática o
-- planner acabava combinando dois bitmap scans e ordenando o resultado. Este
-- índice tem exatamente as colunas do `distinct on (post_id) order by post_id,
-- aura_count desc, created_at desc`, com o recorte de comentário raiz visível
-- no `where` parcial, então o Postgres lê a primeira entrada de cada post
-- direto do índice — sem BitmapAnd e sem Sort.
--
-- Parcial de propósito: só indexa comentário raiz visível, que é uma fração
-- das linhas de forum_comments — mais barato de manter em INSERT/UPDATE que um
-- índice completo, e é o único recorte que a listagem consulta.

create index if not exists idx_forum_comments_top_root
  on public.forum_comments (post_id, aura_count desc, created_at desc)
  where is_hidden = false and parent_comment_id is null;
