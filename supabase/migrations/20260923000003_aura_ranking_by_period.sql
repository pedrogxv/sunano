-- Ranking de Aura por período (hoje / últimos 7 dias), para o modal "Ranking"
-- da Central de Aura — complementa o ranking geral já existente (só saldo
-- atual em `user_aura_wallet`, ver getUserAuraRank). Como não existe uma
-- coluna/tabela de agregação pronta por período, soma o `delta` positivo do
-- `aura_ledger` (só ganhos, ignora perdas — dá o "quanto essa pessoa
-- conquistou no período", que é o que uma corrida diária/semanal quer
-- mostrar, em vez do saldo líquido que já mistura resgates de loja e
-- dislikes recebidos). Usa o índice `idx_aura_ledger_created_at (created_at
-- desc)` (20260920000000_load_analysis_missing_indexes.sql) para o filtro de
-- período; o agregado por usuário roda só sobre as linhas que caem na janela,
-- não a tabela inteira.
--
-- Chamada só via `unstable_cache` no server (revalidate de alguns minutos,
-- mesmo padrão de `getActivityCounts` em users-repository.ts) — nunca direto
-- por request, pra não pesar o banco a cada abertura do modal.
create or replace function public.get_aura_ranking_by_period(
  p_since  timestamptz,
  p_limit  integer default 10
) returns table(user_id uuid, gained integer)
language sql stable security definer
set search_path = public as $$
  select al.user_id, sum(al.delta)::integer as gained
  from public.aura_ledger al
  where al.created_at >= p_since
    and al.delta > 0
  group by al.user_id
  order by gained desc
  limit p_limit;
$$;

revoke execute on function public.get_aura_ranking_by_period(timestamptz, integer) from public;
grant execute on function public.get_aura_ranking_by_period(timestamptz, integer) to service_role, authenticated, anon;
