-- Acrescenta as imagens do comentário destaque ao preview da listagem do
-- fórum (ver 20261010000000_forum_post_top_comment_preview.sql).
--
-- Motivo: comentário cujo conteúdo é uma imagem ou um GIF (KLIPY grava a URL
-- do GIF no mesmo `image_urls`, não há coluna separada) aparecia no preview
-- só com o texto solto — e quando o comentário era *só* mídia, sem texto
-- nenhum, o preview ficava visualmente vazio. Trazendo a primeira URL, o card
-- mostra uma miniatura e o total de imagens.
--
-- Só a PRIMEIRA imagem vai no payload (`image_urls[1]`) e mais a contagem
-- total: o preview mostra uma miniatura só, então trafegar as duas URLs (o
-- limite da tabela é 2) seria peso morto na listagem inteira. `image_count`
-- permite ao card indicar "+1" sem precisar da segunda URL.
--
-- Precisa de `drop` antes do `create`: acrescentar coluna ao `returns table`
-- muda o tipo de retorno, e Postgres recusa isso num `create or replace`
-- (42P13). As colunas anteriores seguem idênticas e na mesma ordem — só as
-- duas novas entram no fim.

drop function if exists public.get_forum_posts_comment_summary(uuid[], integer);

create function public.get_forum_posts_comment_summary(
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
  top_comment_at      timestamptz,
  top_comment_image   text,
  top_comment_images  integer
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
      c.created_at,
      c.image_urls[1] as image_url,
      coalesce(array_length(c.image_urls, 1), 0) as image_count
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
    top_comments.created_at,
    top_comments.image_url,
    top_comments.image_count
  from counts
  left join top_comments on top_comments.post_id = counts.post_id;
$$;

revoke all on function public.get_forum_posts_comment_summary(uuid[], integer) from public;
grant execute on function public.get_forum_posts_comment_summary(uuid[], integer) to service_role;
