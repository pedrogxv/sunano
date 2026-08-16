-- Variantes de produto (ex: cor/modelo) com estoque e preço próprios.
-- Produtos sem variantes continuam usando store_products.stock/price_cents
-- direto (fallback). Quando há variantes ativas, store_products.stock passa
-- a ser mantido como a soma dos estoques das variantes ativas (escrito por
-- replaceProductVariants em lib/server/repositories/store-repository.ts),
-- para que telas que só leem store_products.stock (listagem admin,
-- dashboard) continuem corretas sem precisar conhecer variantes.

create table if not exists public.store_product_variants (
  id                    uuid        primary key default gen_random_uuid(),
  product_id            uuid        not null references public.store_products(id) on delete cascade,
  label                 text        not null check (char_length(label) between 1 and 120),
  price_cents_override  integer     check (price_cents_override is null or price_cents_override > 0),
  stock                 integer     not null default 0 check (stock >= 0),
  position              integer     not null default 0,
  is_active             boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists store_product_variants_product_idx
  on public.store_product_variants (product_id, position);

-- Reaproveita a função de trigger já criada em supabase/store.sql.
create trigger store_product_variants_updated_at
  before update on public.store_product_variants
  for each row execute function public.set_updated_at();

alter table public.store_product_variants enable row level security;

-- Diferente de store_product_specs (leitura pública irrestrita), aqui há
-- preço/estoque então só variantes ativas são legíveis publicamente —
-- mesmo padrão de store_products.
create policy "Public read active variants"
  on public.store_product_variants for select
  using (is_active = true);
-- Sem policy de insert/update/delete: escrita só via service-role (API admin).

-- RPC de decremento atômico de estoque por variante, mesmo padrão de
-- decrement_store_stock (supabase/migrations/20260724_fix_stock_oversell.sql):
-- UPDATE ... WHERE stock >= p_quantity fecha a janela TOCTOU entre a checagem
-- de estoque no checkout e o decremento real no webhook.
create function public.decrement_variant_stock(p_variant_id uuid, p_quantity integer)
returns boolean language plpgsql security definer as $$
declare
  v_updated boolean;
begin
  update public.store_product_variants
  set stock = stock - p_quantity,
      updated_at = now()
  where id = p_variant_id and stock >= p_quantity
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

revoke execute on function public.decrement_variant_stock(uuid, integer) from public, anon, authenticated;
grant execute on function public.decrement_variant_stock(uuid, integer) to service_role;
