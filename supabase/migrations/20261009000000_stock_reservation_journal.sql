-- Diário de reservas de estoque em voo.
--
-- O checkout decrementa o estoque (RPC atômica) ANTES de chamar o gateway,
-- e reverte manualmente em cada caminho de erro — não há transação real via
-- PostgREST entre o decremento e o insert do pedido. O rollback, porém, só
-- existe na memória do request: se a Function morrer no meio (timeout de
-- `maxDuration = 20` com a Asaas lenta, OOM, deploy no meio do request), o
-- estoque fica decrementado para sempre. Nenhum cron alcança esse caso,
-- porque `expireStalePendingOrders` varre `store_orders` e nesse cenário
-- não existe pedido nenhum.
--
-- Cada linha aqui é uma reserva aplicada e ainda não confirmada. O checkout
-- grava antes de chamar o gateway e apaga ao criar o pedido (ou ao reverter).
-- O que sobrar além da janela de tolerância é, por definição, uma reserva
-- órfã: estoque descontado sem pedido correspondente.

create table if not exists public.store_stock_reservations (
  id uuid primary key default gen_random_uuid(),
  -- Agrupa as linhas de um mesmo checkout: ou todas viram pedido, ou todas
  -- voltam para o estoque.
  reservation_group uuid not null,
  product_id uuid not null references public.store_products(id) on delete cascade,
  variant_id uuid references public.store_product_variants(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists store_stock_reservations_group_idx
  on public.store_stock_reservations (reservation_group);

-- O cron varre por idade; é o único filtro que ele usa.
create index if not exists store_stock_reservations_created_at_idx
  on public.store_stock_reservations (created_at);

-- Mesma postura das RPCs de estoque: nada de acesso pelo cliente.
alter table public.store_stock_reservations enable row level security;
revoke all on public.store_stock_reservations from public, anon, authenticated;
grant all on public.store_stock_reservations to service_role;

comment on table public.store_stock_reservations is
  'Reservas de estoque aplicadas pelo checkout e ainda não confirmadas por um pedido. Linhas antigas são reservas órfãs (Function morreu no meio) e têm o estoque devolvido pelo cron de expiração.';

-- Devolve ao estoque toda reserva mais velha que `p_older_than_minutes` e
-- apaga as linhas correspondentes, numa transação só.
--
-- A janela de tolerância precisa ser confortavelmente maior que o
-- `maxDuration` da rota de checkout (20 s): uma reserva de um request ainda
-- em andamento não pode ser devolvida por baixo dele.
create or replace function public.release_orphaned_stock_reservations(
  p_older_than_minutes integer default 15
)
returns integer language plpgsql security definer as $$
declare
  v_released integer := 0;
  v_row record;
begin
  for v_row in
    delete from public.store_stock_reservations
    where created_at < now() - make_interval(mins => p_older_than_minutes)
    returning product_id, variant_id, quantity
  loop
    if v_row.variant_id is not null then
      update public.store_product_variants
      set stock = case when stock is null then null else stock + v_row.quantity end,
          updated_at = now()
      where id = v_row.variant_id;
    else
      update public.store_products
      set stock = case when stock is null then null else stock + v_row.quantity end,
          updated_at = now()
      where id = v_row.product_id;
    end if;
    v_released := v_released + 1;
  end loop;

  return v_released;
end;
$$;

revoke execute on function public.release_orphaned_stock_reservations(integer)
  from public, anon, authenticated;
grant execute on function public.release_orphaned_stock_reservations(integer)
  to service_role;
