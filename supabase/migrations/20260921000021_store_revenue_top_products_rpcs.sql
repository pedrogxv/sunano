-- RPCs para os cards "Receita" e "Produtos mais vendidos" do dashboard admin
-- (só renderizados/consultados por webmaster — ver app/api/admin/dashboard/route.ts).
--
-- "Receita conta" = pedidos que já foram pagos e não foram cancelados/expirados/
-- ainda pendentes: paid, awaiting_shipping_info, shipped, delivered, refunded.
-- Um pedido 'refunded' continua entrando na soma, mas líquido de
-- `refunded_cents` (estorno total zera a contribuição, parcial reduz) — é o
-- valor que de fato ficou em caixa, não o bruto da venda original.
--
-- Mesmo padrão de agregação no Postgres do count_orders_by_status()
-- (20260916_order_status_counts_rpc.sql): soma em SQL em vez de trazer uma
-- linha por pedido pro Node.
create or replace function public.get_order_revenue_between(p_from timestamptz, p_to timestamptz)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(total_cents - refunded_cents), 0)::bigint
  from store_orders
  where created_at >= p_from
    and created_at < p_to
    and status in ('paid', 'awaiting_shipping_info', 'shipped', 'delivered', 'refunded')
$$;

revoke execute on function public.get_order_revenue_between(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_order_revenue_between(timestamptz, timestamptz) to service_role;

-- Ranking de produtos mais vendidos no período, por unidades. `items` é jsonb
-- (não há order_items normalizada — ver listOrdersForAdmin em
-- orders-repository.ts), então desaninha com jsonb_array_elements, mesmo
-- padrão de get_recent_product_purchase_quantity()
-- (20260921000009_store_daily_purchase_limit.sql).
--
-- Receita aqui é bruta por item (preço x quantidade no momento da compra),
-- sem descontar estorno: `refunded_cents` é só no nível do pedido, não por
-- item, então não dá pra ratear com precisão — limitação aceita.
create or replace function public.get_top_selling_products(p_from timestamptz, p_to timestamptz, p_limit integer default 5)
returns table (product_id text, product_name text, units_sold bigint, revenue_cents bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    item->>'id' as product_id,
    max(item->>'name') as product_name,
    sum((item->>'quantity')::integer)::bigint as units_sold,
    sum((item->>'quantity')::integer * (item->>'price_cents')::integer)::bigint as revenue_cents
  from store_orders o
  cross join lateral jsonb_array_elements(o.items) as item
  where o.created_at >= p_from
    and o.created_at < p_to
    and o.status in ('paid', 'awaiting_shipping_info', 'shipped', 'delivered', 'refunded')
  group by item->>'id'
  order by units_sold desc
  limit p_limit
$$;

revoke execute on function public.get_top_selling_products(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.get_top_selling_products(timestamptz, timestamptz, integer) to service_role;
