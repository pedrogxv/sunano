-- RESTAURADA A PARTIR DO BANCO REMOTO (2026-09-12).
--
-- Esta migration foi aplicada direto no banco, sem que o arquivo
-- chegasse ao repositório — o histórico local e o remoto divergiram, e
-- `supabase db push` passou a recusar QUALQUER migration nova com
-- LegacyDbPushMissingLocalError. O conteúdo abaixo é o SQL real gravado
-- em `supabase_migrations.schema_migrations`, recuperado para o repo.
--
-- NÃO reexecutar manualmente: já está aplicada no remoto. O arquivo
-- existe para o histórico bater e para o próximo `db push` funcionar.
-- Ver AGENTS.md, seção de drift de histórico.

-- ============================================================================
-- Varredura da Loja (2026-09-11): fixa `search_path` nas SECURITY DEFINER que
-- ainda estavam sem.
--
-- Uma função SECURITY DEFINER sem `search_path` fixo resolve nomes não
-- qualificados usando o search_path de QUEM CHAMA. Quem consegue criar um
-- objeto num schema que venha antes na resolução consegue fazer a função
-- executar o objeto dele com os privilégios do dono (postgres). É o clássico
-- search_path hijacking, e é o aviso que o linter do Supabase levanta.
--
-- Hoje o risco aqui é baixo: todas as 13 são executáveis só por `postgres` e
-- `service_role` (conferido em pg_proc.proacl), então não há chamador não
-- confiável. Ficam pendentes mesmo assim porque é a única defesa que faltava
-- nas funções que mexem em estoque, comissão de afiliado e saque:
--   decrement_store_stock, decrement_variant_stock, increment_store_stock,
--   increment_variant_stock, reserve_preorder, preorder_reserved_quantity,
--   release_orphaned_stock_reservations, get_recent_product_purchase_quantity,
--   apply_affiliate_commission_event, request_affiliate_payout,
--   mark_affiliate_payout_paid, cancel_affiliate_payout, anonymize_user_data.
--
-- Feito com ALTER FUNCTION (não `create or replace`) de propósito: só anexa a
-- configuração, sem reescrever corpo nenhum — nada do comportamento muda e não
-- há risco de reintroduzir uma versão antiga de função ao editar o arquivo
-- (armadilha conhecida deste repo).
--
-- O laço pega qualquer SECURITY DEFINER de `public` sem search_path, então é
-- idempotente e cobre também as que forem criadas sem o SET no futuro.
-- ============================================================================

do $$
declare
  fn record;
  n integer := 0;
begin
  for fn in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prosecdef = true
      and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path%'
  loop
    execute format('alter function %s set search_path = public', fn.assinatura);
    n := n + 1;
  end loop;

  raise notice 'search_path fixado em % funcao(oes) SECURITY DEFINER', n;
end $$
