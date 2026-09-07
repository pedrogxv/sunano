-- Marca de ambiente do gateway em cada pedido.
--
-- Até aqui não havia como distinguir um pedido feito contra a Asaas sandbox
-- (pagamento de mentira, cartão de teste, PIX que nunca existiu) de um pedido
-- real: os dois vivem na mesma tabela, aparecem na mesma fila do admin, no
-- "Meus Pedidos" do cliente e — pior — somam na Receita do dashboard. O único
-- sinal do ambiente era `ASAAS_ENV`, que existe só em runtime e não fica
-- gravado em lugar nenhum.
--
-- `is_sandbox` congela esse sinal no próprio pedido, no momento do checkout.
-- Default `false` porque produção é o caso normal daqui pra frente; o backfill
-- abaixo é que cuida do histórico.
alter table public.store_orders
  add column if not exists is_sandbox boolean not null default false;

comment on column public.store_orders.is_sandbox is
  'true = pedido criado com ASAAS_ENV=sandbox (pagamento de teste). Gravado no checkout a partir de isSandboxGateway() e nunca alterado depois. Telas do cliente, dashboard/receita e a fila do admin filtram por is_sandbox = false por padrão.';

-- Backfill: TODO pedido que existe hoje é de sandbox — a loja ainda não abriu
-- em produção, e todo o histórico atual veio de teste. Roda antes do índice
-- pra não reescrever o índice inteiro logo depois.
update public.store_orders set is_sandbox = true where is_sandbox = false;

-- Praticamente toda leitura de pedido passa a carregar `is_sandbox = false`
-- junto do recorte que já usava (status, dono, data). Índice parcial em vez
-- de índice na coluna: a seletividade útil é "os de produção", e em regime
-- normal o sandbox vira a minoria — indexar só o lado consultado mantém o
-- índice pequeno.
create index if not exists store_orders_production_created_at_idx
  on public.store_orders (created_at desc)
  where is_sandbox = false;

-- Receita e "mais vendidos" do dashboard: dinheiro de teste não pode entrar na
-- soma. Mesmas funções de 20260921000021_store_revenue_top_products_rpcs.sql,
-- só com o recorte de ambiente adicionado.
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
    and is_sandbox = false
    and status in ('paid', 'awaiting_shipping_info', 'shipped', 'delivered', 'refunded')
$$;

revoke execute on function public.get_order_revenue_between(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_order_revenue_between(timestamptz, timestamptz) to service_role;

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
    and o.is_sandbox = false
    and o.status in ('paid', 'awaiting_shipping_info', 'shipped', 'delivered', 'refunded')
  group by item->>'id'
  order by units_sold desc
  limit p_limit
$$;

revoke execute on function public.get_top_selling_products(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.get_top_selling_products(timestamptz, timestamptz, integer) to service_role;

-- Contagem por status dos blocos de filtro da fila do admin. Ganha parâmetro
-- de ambiente porque o admin passa a escolher o recorte (produção | sandbox |
-- todos) e os números dos blocos têm que bater com a lista embaixo deles.
--
-- `p_is_sandbox null` = todos. Default `false` mantém compatível qualquer
-- chamada antiga sem argumento: ela passa a contar só produção, que é o
-- comportamento desejado.
-- A assinatura antiga (sem argumento) precisa sair antes: `create or replace`
-- não substitui uma função por outra de aridade diferente, cria uma sobrecarga
-- — e aí `count_orders_by_status()` ficaria ambígua entre as duas.
drop function if exists public.count_orders_by_status();

create or replace function public.count_orders_by_status(p_is_sandbox boolean default false)
returns table (status text, count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select status, count(*)
  from store_orders
  where p_is_sandbox is null or is_sandbox = p_is_sandbox
  group by status
$$;

revoke execute on function public.count_orders_by_status(boolean) from public, anon, authenticated;
grant execute on function public.count_orders_by_status(boolean) to service_role;
