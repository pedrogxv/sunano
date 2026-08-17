-- Preço mínimo de R$6,00 (600 centavos) por produto/variante — mesmo padrão
-- das outras regras de negócio da loja: reforçadas no banco além da API/form,
-- pra nenhum caminho de escrita (incluindo scripts futuros) conseguir burlar.
alter table public.store_products
  drop constraint if exists store_products_price_cents_check;
alter table public.store_products
  add constraint store_products_price_cents_check check (price_cents >= 600);

alter table public.store_product_variants
  drop constraint if exists store_product_variants_price_check;
alter table public.store_product_variants
  add constraint store_product_variants_price_check
  check (price_cents_override is null or price_cents_override >= 600);
