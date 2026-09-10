-- Performance da listagem do fórum (aba "Recente" da home e afins).
--
-- Três gargalos, todos no caminho de abrir /forum:
--
-- 1. `saved_count` trazia UMA LINHA POR SALVAMENTO. `enrichForumPostRows`
--    fazia `select post_id from forum_saved_posts where post_id in (...)` e
--    contava em JS — exatamente o mesmo anti-padrão que
--    20261010000000_forum_post_top_comment_preview.sql já tinha eliminado
--    para a contagem de comentários, mas que continuou aqui. Um post com
--    2.000 salvamentos trafega 2.000 linhas por página de listagem só pra
--    virar um número. A RPC abaixo devolve no máximo 1 linha por post.
--
-- 2. `forum_saved_posts` não tinha índice utilizável por `post_id` sozinho —
--    só `(user_id, post_id)` e `(user_id, created_at)`, ambos com `user_id`
--    na frente, inúteis para um filtro que não menciona `user_id`. A
--    contagem por post fazia seq scan.
--
-- 3. `forum_posts` não tinha índice por `user_id`. A checagem
--    `hasForumPostsByUser` (que decide se a aba "Meus Posts" aparece) faz
--    `count exact` filtrando por `user_id` e por isso varria a tabela
--    inteira — é o motivo de a aba demorar visivelmente a aparecer.

-- (2) Contagem de salvamentos por post.
create index if not exists idx_forum_saved_posts_post
  on public.forum_saved_posts (post_id);

-- (3) "Meus Posts" + listagem de posts de um autor (aba "user" do perfil).
create index if not exists idx_forum_posts_user_created
  on public.forum_posts (user_id, created_at desc);

-- (1) Contagem agregada no banco, uma linha por post.
create or replace function public.get_forum_posts_saved_counts(
  p_post_ids uuid[]
) returns table(
  post_id     uuid,
  saved_count integer
)
language sql stable security definer
set search_path = public as $$
  select s.post_id, count(*)::integer
  from public.forum_saved_posts s
  where s.post_id = any(p_post_ids)
  group by s.post_id;
$$;

revoke all on function public.get_forum_posts_saved_counts(uuid[]) from public;
grant execute on function public.get_forum_posts_saved_counts(uuid[]) to service_role;
