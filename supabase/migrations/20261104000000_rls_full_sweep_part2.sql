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
-- Varredura completa de RLS (2026-09-11, parte 2)
--
-- A parte 1 (20261103000000) fechou escrita direta em tabela. Esta fecha os
-- vetores que sobraram, achados varrendo pg_proc, pg_policies de storage e
-- exposicao de coluna:
--
--  1. prune_offers_cache  - SECURITY DEFINER com EXECUTE para `anon`. Um POST
--     em /rest/v1/rpc/prune_offers_cache com {"retention_days": -99999}, SEM
--     LOGIN NENHUM, apaga a tabela offers_cache inteira. Destrutivo e anonimo.
--  2. notify_restock      - SECURITY DEFINER com EXECUTE para `anon`. Qualquer
--     um dispara notificacao de "voltou ao estoque" para todos os inscritos de
--     um produto E marca notified_at, queimando o alerta: quando o produto
--     realmente voltar, ninguem mais e avisado. So deveria rodar pelas triggers
--     trg_store_product_restock / trg_store_variant_restock.
--  3. get_giver_trust_tier / get_aura_trust_limits / notification_actor_name -
--     aceitam um uuid ARBITRARIO e sao SECURITY DEFINER, entao furam a RLS de
--     user_profiles (que e' owner-only desde 20261102000000). Dao, para
--     qualquer uuid: tier de confianca, se e' VIP, se tem YouTube/Discord
--     vinculado e o display_name.
--  4. market_listings     - policy de SELECT publica (status = 'active') expoe
--     TODAS as colunas da linha, incluindo pix_copy_paste, pix_qr_code_base64 e
--     asaas_customer_id. Hoje a tabela esta vazia, entao e' exposicao latente:
--     vaza no dia que o Mercado entrar no ar. Mesma classe do account_tier.
--  5. storage.objects     - as policies de ESCRITA para `authenticated` sao
--     superficie morta: nenhum arquivo do repo toca storage com a chave de
--     sessao (os 18 arquivos que usam .storage. usam service_role, inclusive os
--     scripts de manutencao). Enquanto existirem, da' para subir arquivo direto
--     no bucket pulando a validacao das rotas (tamanho, MIME, recompressao).
--     A de DELETE ainda tinha `OR admin_has_permission('peripherals_write')`
--     sem escopo de nome, deixando um admin de perifericos apagar QUALQUER
--     objeto do bucket, inclusive avatar e banner de todo mundo.
--
-- Nada aqui e' usado pelo app com chave anon/sessao: `service_role` tem
-- rolbypassrls = true (verificado em pg_roles), entao rota e script continuam
-- iguais. Revogar EXECUTE de anon/authenticated nao mexe no grant do
-- service_role.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RPCs que nunca deveriam ser chamaveis pelo cliente
-- ---------------------------------------------------------------------------

-- Destrutiva e anonima.
revoke execute on function public.prune_offers_cache(integer) from anon, authenticated;
-- Efeito colateral: manda notificacao e queima o alerta de restock.
revoke execute on function public.notify_restock(uuid, uuid) from anon, authenticated;
-- Vazam dado de perfil de um uuid arbitrario, furando a RLS de user_profiles.
revoke execute on function public.get_giver_trust_tier(uuid) from anon, authenticated;
revoke execute on function public.get_aura_trust_limits(uuid) from anon, authenticated;
revoke execute on function public.notification_actor_name(uuid) from anon, authenticated;
-- ---------------------------------------------------------------------------
-- 2. market_listings - tira a leitura publica
--
-- Todas as leituras do app passam por lib/server/repositories/market-repository.ts
-- com service_role, entao a policy nao serve para nada alem de expor as colunas
-- de pagamento. Se um dia o Mercado precisar de leitura direta pelo cliente,
-- o caminho e' uma VIEW com as colunas publicas (+ security_invoker), nunca
-- SELECT na tabela crua.
-- ---------------------------------------------------------------------------
drop policy if exists "Public read active market listings" on public.market_listings;
-- ---------------------------------------------------------------------------
-- 3. storage.objects - escrita passa a ser exclusiva do service_role
--
-- Leitura fica como esta: "Public read access" (bucket peripherals, que e'
-- public de qualquer jeito) e "Support images read access" (cada um le so o
-- proprio anexo de ticket).
-- ---------------------------------------------------------------------------
drop policy if exists "Scoped upload access"          on storage.objects;
drop policy if exists "Scoped update access"          on storage.objects;
drop policy if exists "Scoped delete access"          on storage.objects;
drop policy if exists "Comment images upload access"  on storage.objects;
drop policy if exists "Comment images delete access"  on storage.objects;
drop policy if exists "Support images upload access"  on storage.objects;
drop policy if exists "Support images delete access"  on storage.objects
