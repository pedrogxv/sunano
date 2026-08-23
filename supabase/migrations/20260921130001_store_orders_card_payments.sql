-- Colunas de suporte a pagamento com cartão de crédito (via Asaas Checkout
-- hospedado — ver app/api/store/checkout/route.ts e
-- lib/server/integrations/asaas.ts). `pix_price_cents` e
-- `card_surcharge_percent` são um snapshot do que valia NO MOMENTO da
-- compra: sem isso, um pedido antigo fica inexplicável se o admin editar o
-- percentual global depois (store_settings.card_surcharge_percent).
alter table public.store_orders
  add column if not exists asaas_checkout_id text,
  add column if not exists asaas_installment_id text,
  add column if not exists installment_count integer,
  add column if not exists pix_price_cents integer,
  add column if not exists card_surcharge_percent numeric(5,2);

create index if not exists store_orders_asaas_checkout_id_idx
  on public.store_orders (asaas_checkout_id)
  where asaas_checkout_id is not null;
