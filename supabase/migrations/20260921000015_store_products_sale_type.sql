-- Permite anunciar produtos em pré-venda (antes de ter estoque físico) e
-- depois converter pra "normal"/"pronta entrega" sem recriar o anúncio.
alter table if exists public.store_products
  add column if not exists sale_type text not null default 'normal';

alter table if exists public.store_products
  drop constraint if exists store_products_sale_type_check;

alter table if exists public.store_products
  add constraint store_products_sale_type_check
  check (sale_type in ('pre_order', 'ready_stock', 'normal'));

create index if not exists idx_store_products_sale_type
  on public.store_products(sale_type)
  where sale_type <> 'normal';
