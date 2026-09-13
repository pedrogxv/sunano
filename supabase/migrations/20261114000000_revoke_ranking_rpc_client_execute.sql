-- Tira o EXECUTE de anon/authenticated nas duas RPCs de ranking por período.
--
-- Achado (varredura 5, 13/09/2026): `get_aura_ranking_by_period` e
-- `get_activity_ranking_by_period` são `security definer` E seguem com
-- `grant execute ... to authenticated, anon` (ver 20260923000003 e
-- 20261003000000). Isso é exatamente o que o invariante
-- `security_definer_exposta` de supabase/tests/security_invariants.sql proíbe:
-- uma função que roda como o dono (furando a RLS) e ainda por cima é chamável
-- direto pelo cliente via PostgREST (`POST /rest/v1/rpc/<fn>` com a anon key).
--
-- Mesma classe de buraco que a varredura de 04/11 fechou em
-- `get_giver_trust_tier`/`get_aura_trust_limits` (20261104000000): estas duas
-- só ficaram de fora porque nasceram em outra migration e vieram com o grant
-- a `authenticated, anon` de fábrica.
--
-- Impacto concreto: `get_aura_ranking_by_period` lê `aura_ledger` — tabela que
-- NÃO está na allowlist de leitura de cliente — e devolve, por `user_id`, a
-- soma de Aura ganha na janela. O `p_limit` é controlado por quem chama e não
-- tem teto no SQL, então um anônimo com a anon key pública enumera o total de
-- Aura de TODOS os usuários (não só o "top 10" que a tela mostra), furando a
-- camada do Next inteira. `get_activity_ranking_by_period` expõe o mesmo tipo
-- de agregado de atividade.
--
-- Não quebra nada: os ÚNICOS chamadores são server-side, pelo service role
-- (createSupabaseAdminClient → db.rpc(...) em lib/server/repositories/
-- aura-repository.ts e users-repository.ts). O service role tem rolbypassrls e
-- NÃO é afetado por revoke de grant para anon/authenticated — o grant a
-- `authenticated, anon` era superfície morta. As telas de ranking (Central de
-- Aura, diretório de usuários) continuam iguais, servidas pela rota do Next.
--
-- `revoke` é idempotente (revogar o que não está concedido é no-op), então a
-- migration pode reaplicar sem erro.

revoke execute on function public.get_aura_ranking_by_period(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.get_aura_ranking_by_period(timestamptz, integer) to service_role;

revoke execute on function public.get_activity_ranking_by_period(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.get_activity_ranking_by_period(timestamptz, integer) to service_role;
