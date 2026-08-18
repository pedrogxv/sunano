-- Permite o admin destacar manualmente produtos na seção "Destaques" da loja.
alter table if exists public.store_products
  add column if not exists is_featured boolean not null default false;

create index if not exists idx_store_products_featured
  on public.store_products(is_featured, created_at desc)
  where is_featured = true;
