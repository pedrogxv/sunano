-- "Esgotado" manual: um terceiro estado de status do produto, independente
-- de is_active (visibilidade) e de stock (controle de estoque numérico).
-- Produto com is_sold_out = true continua visível na loja (is_active
-- permanece true) mas não pode ser comprado — mesmo tratamento que já
-- existe hoje para stock = 0, só que setado manualmente pelo admin em vez
-- de derivado do estoque.

alter table public.store_products
  add column if not exists is_sold_out boolean not null default false;
