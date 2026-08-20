-- Link store_products (loja) to peripherals via optional FK.
-- A peripheral may have at most one linked store-type product. The loja
-- public pages join through this column to show the corresponding item.

alter table public.store_products
  add column if not exists peripheral_id uuid references public.peripherals(id) on delete set null;

create index if not exists store_products_peripheral_idx
  on public.store_products (peripheral_id);
