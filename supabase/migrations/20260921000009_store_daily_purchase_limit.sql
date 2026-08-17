-- Limite de 15 unidades/produto/usuário a cada 24h, aplicado só a produtos
-- SEM estoque cadastrado (stock null — ver 20260921000006_store_optional_stock.sql).
-- Produto com estoque continua limitado pelo próprio estoque real + o teto
-- de 20/linha já existente no checkout (app/api/store/checkout/route.ts).
--
-- Sem lei brasileira definindo um número fixo de unidades que caracteriza
-- revenda/redistribuição (não é uma exigência do CDC) — isso é uma política
-- comercial da loja para produtos sem controle de estoque, não uma obrigação
-- legal específica.
--
-- store_orders.metadata->>'user_id' já guarda o comprador, mas jsonb sem
-- índice não é viável pra somar quantidade por (usuário, produto, 24h) em
-- todo checkout. Adiciona uma coluna real indexada, backfilled a partir do
-- metadata existente.
alter table public.store_orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;

update public.store_orders
set user_id = (metadata->>'user_id')::uuid
where user_id is null and metadata ? 'user_id';

create index if not exists store_orders_user_created_idx
  on public.store_orders (user_id, created_at)
  where user_id is not null;

-- RPC: soma a quantidade já comprada de um produto por um usuário nas
-- últimas 24h, contando só pedidos que reservaram estoque de verdade
-- (exclui 'cancelled'/'expired' — ver 20260918000000_store_orders_stock_reservation.sql,
-- que já devolve o estoque reservado nesses casos). security definer +
-- grant só pra service_role, mesmo padrão das outras RPCs da loja: o
-- checkout roda com a service role, não com a sessão do usuário.
create or replace function public.get_recent_product_purchase_quantity(
  p_user_id uuid,
  p_product_id uuid,
  p_since timestamptz
)
returns integer language sql stable security definer as $$
  select coalesce(sum((item->>'quantity')::integer), 0)::integer
  from public.store_orders o
  cross join lateral jsonb_array_elements(o.items) as item
  where o.user_id = p_user_id
    and o.created_at >= p_since
    and o.status not in ('cancelled', 'expired')
    and item->>'id' = p_product_id::text
$$;

revoke execute on function public.get_recent_product_purchase_quantity(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.get_recent_product_purchase_quantity(uuid, uuid, timestamptz) to service_role;
