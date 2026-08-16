-- A lista padrão ("Favoritos") passa a nascer pública (is_public=true) —
-- ela alimenta a seção "Lista de Compras" do perfil, que fica visível por
-- padrão; o dono esconde com o toggle de is_public que já existia para as
-- listas nomeadas extras. Backfill para quem já tinha lista padrão criada
-- antes desta mudança e ainda não tinha mexido em is_public.
update public.store_wishlists
set is_public = true
where is_default = true and is_public = false;
