-- Preview do "melhor comentário" na listagem do fórum (destaque estilo
-- Reddit/Twitter: o card do post mostra um trecho do comentário com mais aura).
--
-- Motivação de performance: antes desta função, `enrichForumPostRows` já fazia
-- uma query separada só para CONTAR comentários, e ela trazia UMA LINHA POR
-- COMENTÁRIO (`select post_id ... in (postIds)`) para contar em JS — num post
-- com 800 comentários isso são 800 linhas trafegadas por página de listagem.
-- Esta RPC resolve as duas coisas (contagem + comentário destaque) em uma única
-- ida ao banco que devolve no máximo 1 linha por post, e nunca traz o `body`
-- inteiro: usa a coluna gerada `body_preview` (left(body, 200)).
--
-- O `distinct on (post_id)` ordenado por (post_id, aura_count desc, created_at
-- desc) casa exatamente com o índice parcial já existente
-- `idx_forum_comments_post_aura` (20260821_paginated_comment_indexes.sql), então
-- o Postgres faz index scan e pega a primeira linha de cada post — sem sort e
-- sem varrer os comentários todos.
--
-- Regras de destaque (aplicadas aqui e não no client, pra não trafegar
-- candidato que seria descartado):
--   * só comentário visível (is_hidden = false) — mesmo critério da contagem;
--   * só comentário raiz (parent_comment_id is null): resposta dentro de uma
--     thread sem o contexto do pai vira preview sem sentido;
--   * exige `p_min_aura` de aura (default 1): comentário com 0 aura não é
--     "destaque", é só o primeiro que apareceu. Post sem nenhum comentário
--     qualificado devolve as colunas de preview nulas e o card só mostra a
--     contagem, como antes.

create or replace function public.get_forum_posts_comment_summary(
  p_post_ids  uuid[],
  p_min_aura  integer default 1
) returns table(
  post_id             uuid,
  comment_count       integer,
  top_comment_id      uuid,
  top_comment_preview text,
  top_comment_aura    integer,
  top_comment_user_id uuid,
  top_comment_author  text,
  top_comment_at      timestamptz
)
language sql stable security definer
set search_path = public as $$
  with counts as (
    select c.post_id, count(*)::integer as comment_count
    from public.forum_comments c
    where c.post_id = any(p_post_ids)
      and c.is_hidden = false
    group by c.post_id
  ),
  top_comments as (
    select distinct on (c.post_id)
      c.post_id,
      c.id,
      c.body_preview,
      c.aura_count,
      c.user_id,
      c.author_name,
      c.created_at
    from public.forum_comments c
    where c.post_id = any(p_post_ids)
      and c.is_hidden = false
      and c.parent_comment_id is null
      and c.aura_count >= p_min_aura
    order by c.post_id, c.aura_count desc, c.created_at desc
  )
  select
    counts.post_id,
    counts.comment_count,
    top_comments.id,
    top_comments.body_preview,
    top_comments.aura_count,
    top_comments.user_id,
    top_comments.author_name,
    top_comments.created_at
  from counts
  left join top_comments on top_comments.post_id = counts.post_id;
$$;

revoke all on function public.get_forum_posts_comment_summary(uuid[], integer) from public;
grant execute on function public.get_forum_posts_comment_summary(uuid[], integer) to service_role;
