-- Estoque agora é opcional: produtos/variantes sem controle de estoque usam
-- stock = NULL, que significa "nunca esgota" (não decrementa, não mostra
-- badge de estoque baixo/esgotado). Produtos com estoque numérico continuam
-- se comportando exatamente como antes. Isso é uma mudança de contrato, não
-- só de schema — as RPCs de decremento precisam devolver sucesso quando
-- stock é NULL (não decrementam nada, só confirmam a "venda").

alter table public.store_products
  alter column stock drop not null,
  alter column stock drop default;

alter table public.store_products
  drop constraint if exists store_products_stock_check;
alter table public.store_products
  add constraint store_products_stock_check check (stock is null or stock >= 0);

alter table public.store_product_variants
  alter column stock drop not null,
  alter column stock drop default;

alter table public.store_product_variants
  drop constraint if exists store_product_variants_stock_check;
alter table public.store_product_variants
  add constraint store_product_variants_stock_check check (stock is null or stock >= 0);

-- decrement_store_stock: quando stock é NULL, o produto não tem controle de
-- estoque — a reserva "sempre funciona" (retorna true) sem tocar a linha.
drop function if exists public.decrement_store_stock(uuid, integer);

create function public.decrement_store_stock(p_product_id uuid, p_quantity integer)
returns boolean language plpgsql security definer as $$
declare
  v_updated boolean;
begin
  update public.store_products
  set stock = case when stock is null then null else stock - p_quantity end,
      updated_at = now()
  where id = p_product_id and (stock is null or stock >= p_quantity)
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

revoke execute on function public.decrement_store_stock(uuid, integer) from public, anon, authenticated;
grant execute on function public.decrement_store_stock(uuid, integer) to service_role;

drop function if exists public.decrement_variant_stock(uuid, integer);

create function public.decrement_variant_stock(p_variant_id uuid, p_quantity integer)
returns boolean language plpgsql security definer as $$
declare
  v_updated boolean;
begin
  update public.store_product_variants
  set stock = case when stock is null then null else stock - p_quantity end,
      updated_at = now()
  where id = p_variant_id and (stock is null or stock >= p_quantity)
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

revoke execute on function public.decrement_variant_stock(uuid, integer) from public, anon, authenticated;
grant execute on function public.decrement_variant_stock(uuid, integer) to service_role;

-- increment_*_stock (rollback/expiração): sem-estoque continua sem-estoque,
-- não "cria" um número do nada.
create or replace function public.increment_store_stock(p_product_id uuid, p_quantity integer)
returns boolean language plpgsql security definer as $$
declare
  v_updated boolean;
begin
  update public.store_products
  set stock = case when stock is null then null else stock + p_quantity end,
      updated_at = now()
  where id = p_product_id
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

revoke execute on function public.increment_store_stock(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_store_stock(uuid, integer) to service_role;

create or replace function public.increment_variant_stock(p_variant_id uuid, p_quantity integer)
returns boolean language plpgsql security definer as $$
declare
  v_updated boolean;
begin
  update public.store_product_variants
  set stock = case when stock is null then null else stock + p_quantity end,
      updated_at = now()
  where id = p_variant_id
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

revoke execute on function public.increment_variant_stock(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_variant_stock(uuid, integer) to service_role;
