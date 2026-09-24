-- Fecha de novo o EXECUTE de anon/authenticated em `get_giver_trust_tier` e
-- devolve a idade da conta para `auth.users`.
--
-- Achado (varredura de 24/09/2026), confirmado NO BANCO DE PRODUCAO com a
-- chave anon publica, sem login nenhum:
--
--   POST /rest/v1/rpc/get_giver_trust_tier {"p_giver_id":"<id de forum_posts>"}
--   HTTP 200  "normal"
--
-- Os `user_id` saem de `forum_posts`, que e' leitura publica, entao da' para
-- enumerar o site inteiro e ler a faixa de Trust de qualquer pessoa, uma conta
-- por vez. O retorno separa `verified` (Trust >= 60), `normal` (40-59) e `new`
-- (< 40, conta com menos de 3 dias, ou status restricted/blocked): e' o
-- gradiente que o AGENTS.md manda nao publicar, e e' exatamente por isso que
-- `can_redeem_physical_item` nasceu fechada em 20261129000000. Tambem e' uma
-- violacao do invariante `security_definer_exposta` de
-- supabase/tests/security_invariants.sql, que estava sujo desde entao.
--
-- COMO O GRANT VOLTOU
-- -------------------
-- 20261104000000 ja' tinha revogado (`revoke execute ... from anon,
-- authenticated`). 20261129000000 recriou a funcao a partir da versao de
-- 20260923000002 e trouxe junto o `grant execute ... to authenticated, anon`
-- daquele arquivo. E' a armadilha conhecida deste repo: reescrever uma funcao
-- antiga reintroduz o que as migrations seguintes tinham corrigido.
--
-- A SEGUNDA REGRESSAO NO MESMO PONTO
-- ----------------------------------
-- A versao de 20261109000000 lia `created_at` de `auth.users` de proposito:
-- `user_profiles.created_at` era escrevivel pela REST, e e' ele que decide o
-- tier, entao uma conta criada hoje virava `verified` na hora e furava o
-- limite anti-farm de Aura. 20261129000000 voltou a ler de
-- `public.user_profiles`. Hoje nao da' para explorar (o grant de UPDATE em
-- `user_profiles` segue revogado desde 20261109000000), mas a defesa em
-- profundidade escrita para isso tinha sumido. Aqui ela volta, agora sobre a
-- logica do Trust Factor.
--
-- O corpo abaixo e' o de 20261129000000 com UMA mudanca: o join com
-- `auth.users`. O mapeamento de faixas, a carencia de 3 dias e o corte por
-- status continuam identicos.
--
-- Nao quebra nada: o unico chamador e' `get_aura_trust_limits`, que tambem e'
-- `security definer` e so' o service_role executa. O service_role tem
-- rolbypassrls e nao e' afetado por revoke de grant de cliente.

create or replace function public.get_giver_trust_tier(p_giver_id uuid)
returns text
language plpgsql stable security definer
set search_path = public as $$
declare
  v_created_at  timestamptz;
  v_score       integer;
  v_status      text;
begin
  -- `created_at` vem de auth.users, que o usuario nao escreve por caminho
  -- nenhum. Ver o bloco "A SEGUNDA REGRESSAO" no cabecalho desta migration.
  select u.created_at, p.trust_score, p.trust_status
    into v_created_at, v_score, v_status
  from public.user_profiles p
  join auth.users u on u.id = p.id
  where p.id = p_giver_id;

  if v_created_at is null then
    return 'new';
  end if;

  -- Conta descartavel recem-criada: o teto apertado e' justamente o que trava
  -- o farm, e nenhuma nota inicial deve fura-lo.
  if now() - v_created_at < interval '3 days' then
    return 'new';
  end if;

  if v_status in ('restricted', 'blocked') then
    return 'new';
  end if;

  if v_score >= 60 then
    return 'verified';
  elsif v_score >= 40 then
    return 'normal';
  end if;

  return 'new';
end;
$$;

-- `revoke` de quem nao tem o grant e' no-op, entao isto e' idempotente.
-- Revogar de `public` junto e' obrigatorio: e' dali que vem o grant implicito
-- de EXECUTE, e tirar so' de anon/authenticated nao fecha nada.
revoke execute on function public.get_giver_trust_tier(uuid) from public, anon, authenticated;
grant execute on function public.get_giver_trust_tier(uuid) to service_role;

comment on function public.get_giver_trust_tier(uuid) is
  'Tier anti-farm de Aura derivado do Trust Factor. SO service_role: exposta ao cliente vira oraculo para sondar o Trust alheio (ver 20261202000000).';
