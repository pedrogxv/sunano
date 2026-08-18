-- Remove a feature "Lista de compras" (wishlists estilo Amazon), introduzida
-- em 20260903/20260905 — removida por não ser necessária. Sem dependência de
-- carrinho ou outra parte do sistema: as duas tabelas eram exclusivas dela.
drop table if exists public.store_wishlist_items;
drop table if exists public.store_wishlists;
