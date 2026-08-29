-- Permite fixar manualmente produtos na seção "Mais vendidos" da Home da
-- Loja, que hoje é 100% automática (ranking de vendas dos últimos 90 dias).
alter table public.store_products
  add column if not exists pin_best_seller boolean not null default false;

-- Ordem manual entre os produtos fixados (menor = mais à frente). Null pra
-- produtos não fixados; recebe um valor ao fixar e é regravado em bloco pela
-- rota de reordenação (arrastar-e-soltar em /admin/store).
alter table public.store_products
  add column if not exists best_seller_position integer;
