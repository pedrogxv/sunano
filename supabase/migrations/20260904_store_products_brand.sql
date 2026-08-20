-- Adiciona marca livre aos produtos da Loja. Diferente de `peripherals`,
-- que usa brand_id (FK para `brands`), aqui é texto livre — nem todo produto
-- da loja tem periférico vinculado, então não dá pra depender do join.
alter table public.store_products
  add column if not exists brand text;

create index if not exists store_products_brand_idx
  on public.store_products (brand);
