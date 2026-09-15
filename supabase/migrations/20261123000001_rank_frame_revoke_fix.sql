-- Tira EXECUTE de `grant_rank_frame` dos roles de cliente.
--
-- A 20261123000000 só fez `revoke ... from public`, e isso NÃO bastou: o
-- Supabase concede EXECUTE a `anon` e `authenticated` por padrão em funções
-- novas do schema `public`, e esses grants são próprios dos roles — não saem
-- junto com o de PUBLIC. Conferido depois de aplicar:
--   anon=X/postgres, authenticated=X/postgres
--
-- O buraco: a função é `security definer` e insere em `user_aura_items`.
-- Qualquer sessão autenticada podia chamá-la via REST passando o próprio
-- `p_user_id` e o slug `rank:aura:1`, concedendo a si mesma a moldura de 1º
-- lugar sem nunca ter entrado no pódio.
--
-- Mesma forma da 20261114000000 (`from public, anon, authenticated`), que é
-- o padrão do repo justamente por causa desse default — revogar só de PUBLIC
-- é o erro que ela documenta.
revoke execute on function public.grant_rank_frame(uuid, text) from public, anon, authenticated;

grant  execute on function public.grant_rank_frame(uuid, text) to service_role;
