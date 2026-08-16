-- Fluxo pós-venda: paid -> awaiting_shipping_info -> shipped -> delivered.
-- store_orders nasceu em supabase/store.sql (fora do histórico de migrations)
-- com `check (status in ('pending','paid','cancelled','refunded'))` sem nome
-- explícito, então o Postgres deu o nome padrão `store_orders_status_check`.
alter table public.store_orders
  drop constraint if exists store_orders_status_check;

alter table public.store_orders
  add constraint store_orders_status_check
  check (status in ('pending', 'paid', 'awaiting_shipping_info', 'shipped', 'delivered', 'cancelled', 'refunded'));

alter table public.store_orders
  add column if not exists tracking_code text,
  add column if not exists carrier text,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz;
