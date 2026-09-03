-- Ranking de "Mais Ativos" por período (hoje / semana / mês), para o filtro de
-- período que a aba "Mais Ativos" do Diretório de Pessoas (/pessoas) ganhou —
-- complementa o ranking geral já existente (soma histórica de posts +
-- comentários, ver getActivityCounts em users-repository.ts). Como não existe
-- coluna/tabela de agregação pronta por período, soma em SQL as três origens de
-- atividade (posts do fórum + comentários do fórum + comentários em notícias)
-- restringindo a janela por `created_at >= p_since`; itens ocultos pela
-- moderação (`is_hidden = true`) não contam, mesmo critério de getActivityCounts.
--
-- Chamada só via `unstable_cache` no server (revalidate de alguns minutos, mesmo
-- padrão de get_aura_ranking_by_period e getActivityCounts) — nunca direto por
-- request, pra não pesar o banco a cada troca de período.
--
-- Índices por `created_at` (parcial em is_hidden) pra a janela de período ler só
-- as linhas recentes em vez de varrer a tabela inteira.
create index if not exists idx_forum_posts_recent_visible
  on public.forum_posts (created_at desc)
  where is_hidden = false;

create index if not exists idx_forum_comments_recent_visible
  on public.forum_comments (created_at desc)
  where is_hidden = false;

create index if not exists idx_blog_comments_recent_visible
  on public.blog_comments (created_at desc)
  where is_hidden = false;

create or replace function public.get_activity_ranking_by_period(
  p_since  timestamptz,
  p_limit  integer default 100
) returns table(user_id uuid, activity integer)
language sql stable security definer
set search_path = public as $$
  with events as (
    select user_id from public.forum_posts
      where is_hidden = false and created_at >= p_since and user_id is not null
    union all
    select user_id from public.forum_comments
      where is_hidden = false and created_at >= p_since and user_id is not null
    union all
    select user_id from public.blog_comments
      where is_hidden = false and created_at >= p_since and user_id is not null
  )
  select e.user_id, count(*)::integer as activity
  from events e
  group by e.user_id
  order by activity desc
  limit p_limit;
$$;

revoke execute on function public.get_activity_ranking_by_period(timestamptz, integer) from public;
grant execute on function public.get_activity_ranking_by_period(timestamptz, integer) to service_role, authenticated, anon;
