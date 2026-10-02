-- Lote de pré-venda e marcação de Lançamento.
--
-- Pré-venda era só um `sale_type` com teto (`preorder_limit`). Faltava dizer
-- de QUAL lote se trata, quando ele sai e em que pé está — e o teto contava
-- reservas de todos os tempos: abrir o "Lote 2" com 50 unidades depois de
-- vender 50 no Lote 1 deixava o lote novo esgotado no primeiro minuto, e a
-- saída era inflar o teto à mão.
--
-- Status (o que o cliente vê, em lib/store-preorder.ts):
--   open             Pré-venda aberta (único em que dá para reservar)
--   sold_out         Esgotado (manual; também é derivado quando o lote enche)
--   next_batch_soon  Novo lote em breve
--   closed           Encerrada
--   shipping         Enviando
--
-- `preorder_batch_started_at` marca o começo do lote atual. O teto conta só
-- pedidos daí em diante. Nulo = conta tudo, que é o comportamento de antes,
-- então as pré-vendas que já existem não mudam de número.

alter table public.store_products
  add column if not exists preorder_batch_name text,
  add column if not exists preorder_ships_at date,
  add column if not exists preorder_status text not null default 'open',
  add column if not exists preorder_batch_started_at timestamptz,
  add column if not exists is_launch boolean not null default false,
  add column if not exists launch_until date;

alter table public.store_products
  drop constraint if exists store_products_preorder_status_check;
alter table public.store_products
  add constraint store_products_preorder_status_check
  check (preorder_status in ('open', 'sold_out', 'next_batch_soon', 'closed', 'shipping'));

alter table public.store_products
  drop constraint if exists store_products_preorder_batch_name_check;
alter table public.store_products
  add constraint store_products_preorder_batch_name_check
  check (preorder_batch_name is null or char_length(preorder_batch_name) between 1 and 60);

comment on column public.store_products.preorder_status is
  'Estado do lote de pré-venda: open | sold_out | next_batch_soon | closed | shipping. Só open aceita reserva (reserve_preorder).';
comment on column public.store_products.preorder_batch_started_at is
  'Início do lote atual. O teto (preorder_limit) conta só pedidos a partir daqui; nulo = todos.';
comment on column public.store_products.is_launch is
  'Entra na seção "Lançamentos e Pré-venda" da Home. launch_until (opcional) tira sozinho depois da data.';

-- Unidades já reservadas no LOTE ATUAL. Mesma soma de antes (pedidos que
-- ainda valem + reservas em voo no diário), agora a partir do início do
-- lote e só de linhas que foram pré-venda (`sale_type` é snapshot do item;
-- nulo = pedido anterior ao snapshot, conta como antes).
create or replace function public.preorder_reserved_quantity(p_product_id uuid)
returns integer language sql stable security definer
set search_path = public as $$
  select coalesce((
    select sum((item->>'quantity')::integer)
    from public.store_orders o,
         lateral jsonb_array_elements(o.items) as item
    where o.status in ('pending', 'paid', 'awaiting_shipping_info', 'shipped', 'delivered')
      and item->>'id' = p_product_id::text
      and coalesce(item->>'sale_type', 'pre_order') = 'pre_order'
      and o.created_at >= coalesce(
        (select preorder_batch_started_at from public.store_products where id = p_product_id),
        '-infinity'::timestamptz
      )
  ), 0)::integer
  + coalesce((
    select sum(quantity)
    from public.store_stock_reservations
    where product_id = p_product_id
  ), 0)::integer;
$$;

revoke execute on function public.preorder_reserved_quantity(uuid)
  from public, anon, authenticated;
grant execute on function public.preorder_reserved_quantity(uuid) to service_role;

-- A mesma conta para uma página de vitrine inteira numa ida só.
create or replace function public.preorder_reserved_quantities(p_product_ids uuid[])
returns table(product_id uuid, reserved integer) language sql stable security definer
set search_path = public as $$
  select p.id, public.preorder_reserved_quantity(p.id)
  from public.store_products p
  where p.id = any(p_product_ids);
$$;

revoke execute on function public.preorder_reserved_quantities(uuid[])
  from public, anon, authenticated;
grant execute on function public.preorder_reserved_quantities(uuid[]) to service_role;

-- Reserva: igual à 20261009000200, mais o status. Só lote ABERTO reserva —
-- a tela já esconde o botão, mas é o banco que decide (um link antigo de
-- checkout ou um carrinho aberto desde ontem passariam pela tela).
create or replace function public.reserve_preorder(
  p_product_id uuid,
  p_quantity integer,
  p_reservation_group uuid
)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_limit integer;
  v_status text;
  v_reserved integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_product_id::text, 0));

  select preorder_limit, preorder_status into v_limit, v_status
  from public.store_products
  where id = p_product_id and sale_type = 'pre_order';

  if not found then
    return false;
  end if;

  if v_status <> 'open' then
    return false;
  end if;

  if v_limit is not null then
    v_reserved := public.preorder_reserved_quantity(p_product_id);
    if (v_reserved + p_quantity) > v_limit then
      return false;
    end if;
  end if;

  insert into public.store_stock_reservations
    (reservation_group, product_id, variant_id, quantity)
  values (p_reservation_group, p_product_id, null, p_quantity);

  return true;
end;
$$;

revoke execute on function public.reserve_preorder(uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_preorder(uuid, integer, uuid) to service_role;

-- Lote reaberto avisa quem pediu "avise-me": é o mesmo pedido de quem
-- esperava o produto voltar, só que a volta aqui é um lote novo.
create or replace function public.trg_store_preorder_reopened()
returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  if new.sale_type = 'pre_order'
     and new.is_active
     and new.preorder_status = 'open'
     and old.preorder_status is distinct from 'open' then
    perform public.notify_restock(new.id, null);
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_store_preorder_reopened() from public, anon, authenticated;

drop trigger if exists trg_store_preorder_reopened on public.store_products;
create trigger trg_store_preorder_reopened
  after update of preorder_status on public.store_products
  for each row execute function public.trg_store_preorder_reopened();
