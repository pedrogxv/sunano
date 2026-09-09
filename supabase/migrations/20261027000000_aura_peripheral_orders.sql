-- Central de Aura — resgate de produto físico vira "pseudo-pedido" em store_orders.
--
-- Até aqui, `redeem_aura_peripheral` (20261025/26xxxx) só debitava Aura e
-- gravava a posse (`user_aura_items` + `aura_purchases`). Não havia nada que o
-- admin pudesse despachar: sem endereço, sem status, sem rastreio.
--
-- Agora o resgate de um periférico também cria uma linha em `store_orders` —
-- reaproveitando toda a infra de pedido da loja (fila do admin, "Meus
-- Pedidos", avanço de status, rastreio, endereço, thread do Discord). O
-- pedido de Aura se distingue por:
--   - `payment_method = 'aura'`
--   - `aura_cost_paid` NÃO nulo (o que saiu da carteira, já com desconto VIP)
--   - `total_cents = 0` (não houve cobrança em dinheiro)
--   - `metadata->>'source' = 'aura_redeem'` + `metadata->>'aura_item_id'`
--
-- O INSERT em `store_orders` é feito no repositório TypeScript logo após a RPC
-- ter sucesso (mesmo padrão do checkout), não aqui dentro do plpgsql — a RPC
-- continua responsável só pela atomicidade do débito de Aura. Esta migration
-- só ADICIONA a coluna e libera o `payment_method`.

-- ────────────────────────────────────────────
-- 1. Coluna do custo em Aura no pedido
-- ────────────────────────────────────────────
alter table public.store_orders
  add column if not exists aura_cost_paid integer;

comment on column public.store_orders.aura_cost_paid is
  'Aura debitada da carteira neste resgate (já com desconto VIP). NÃO nulo = pedido pago com Aura (payment_method=''aura''), total_cents fica 0.';

-- ────────────────────────────────────────────
-- 2. payment_method aceita 'aura'
-- ────────────────────────────────────────────
-- `payment_method` é text livre hoje (sem check constraint). Deixamos
-- explícito com um índice parcial que a fila do admin usa para filtrar
-- "pedidos de Aura" sem varrer a tabela inteira.
create index if not exists store_orders_aura_payment_idx
  on public.store_orders (created_at desc)
  where payment_method = 'aura';
