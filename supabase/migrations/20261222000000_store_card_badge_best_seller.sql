-- "Mais vendido" passa a ser escolha do admin no selo do card, além do
-- automático (pódio de vendas com volume, lib/store-card.ts). Com a Loja
-- recém aberta nenhum produto chegava ao mínimo de unidades, e o selo nunca
-- aparecia.
--
-- Pré-venda e Estoque baixo continuam fora: são estados do produto.

alter table public.store_products drop constraint if exists store_products_card_badge_check;
alter table public.store_products add constraint store_products_card_badge_check
  check (card_badge is null or card_badge in ('sunano_choice', 'limited_edition', 'best_seller', 'best_value', 'new', 'none'));
