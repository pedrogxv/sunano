-- Índices faltantes identificados na auditoria de carga de banco (2026-08-16):
-- colunas usadas em WHERE/ORDER BY frequentes sem índice de suporte, forçando
-- sequential scan em `store_orders`, `user_aura_wallet` e `market_listings`.
--
-- Só CREATE INDEX (aditivo, sem DDL destrutivo) — mesmo padrão de
-- 20260917000001_peripherals_columns_and_indexes.sql: aplicar manualmente via
-- Supabase Dashboard (SQL Editor), não via `supabase db push` (histórico de
-- migrations deste projeto está dessincronizado desde 04/08).

BEGIN;

-- store_orders.metadata->>'user_id': usado em listOrdersByUser,
-- getLatestPendingOrderByUser, filtro por usuário em listOrdersForAdmin, e nas
-- rotinas de anonimização/LGPD (20260613_lgpd_compliance.sql,
-- 20260801_order_metadata_anonymization.sql). Índice de expressão porque o
-- valor vive dentro do jsonb, não numa coluna própria.
CREATE INDEX IF NOT EXISTS idx_store_orders_metadata_user_id
  ON store_orders ((metadata->>'user_id'));

-- store_orders.created_at: ORDER BY em praticamente toda listagem de
-- pedidos (histórico do usuário, fila admin, busca de clientes). Composto com
-- `status` porque `expireStalePendingOrders` filtra por
-- `WHERE status = 'pending' ORDER BY created_at` (cron de expiração).
CREATE INDEX IF NOT EXISTS idx_store_orders_status_created_at
  ON store_orders (status, created_at DESC);

-- user_aura_wallet.balance: ORDER BY (getTopAuraProfiles) e comparação
-- `WHERE balance > ?` (getUserAuraRank, contra a base inteira). A tabela só
-- tinha `user_id` como PK — sem índice em `balance` o ranking de Aura força
-- sequential scan toda vez que a badge de posição é exibida num perfil.
CREATE INDEX IF NOT EXISTS idx_user_aura_wallet_balance
  ON user_aura_wallet (balance DESC);

-- market_listings (status, created_at): padrão de acesso mais comum do
-- Mercado é `WHERE status = 'active' ORDER BY created_at DESC`
-- (listActiveMarketListings/listMyMarketListings/listMarketListingsForModeration,
-- agora paginadas com `.range()`). A migration original só indexava `status` e
-- `created_at` isoladamente.
CREATE INDEX IF NOT EXISTS idx_market_listings_status_created_at
  ON market_listings (status, created_at DESC);

-- aura_ledger.created_at: `dashboard-performance-repository.ts` agrega
-- `SELECT ... WHERE created_at >= ?` sem filtro de user_id (é global, não por
-- usuário) — o índice composto `(user_id, created_at desc)` já existente
-- (20260806_forum_aura.sql) não ajuda essa leitura específica.
CREATE INDEX IF NOT EXISTS idx_aura_ledger_created_at
  ON aura_ledger (created_at DESC);

-- NÃO adicionado: índice em `user_follows.follower_id`. A PK composta é
-- `(follower_id, following_id)` (20260730_people_directory.sql) — Postgres já
-- usa a PK para consultas filtrando só por `follower_id` (primeira coluna),
-- que é o padrão de `getFollowingProfiles`/`isFollowing`. Índice extra seria
-- redundante.

COMMIT;
