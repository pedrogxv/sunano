-- Fila de pedidos do admin separada em Produtos e Serviços.
--
-- Os blocos de contagem por status têm de seguir o mesmo recorte da lista
-- logo abaixo, senão a aba "Serviços" mostraria o número de pedidos da loja
-- inteira. O recorte é o snapshot `requires_shipping_address` do pedido (o
-- mesmo que decide o fluxo pós-venda): true = produto com entrega, false =
-- serviço/digital.
--
-- O parâmetro novo tem default null, então a chamada antiga (só
-- `p_is_sandbox`) continua casando. Mas a assinatura muda, e deixar a de um
-- argumento viva tornaria a chamada ambígua entre as duas: por isso o drop.

drop function if exists public.count_orders_by_status(boolean);

create or replace function public.count_orders_by_status(
  p_is_sandbox boolean default false,
  p_requires_shipping boolean default null
)
returns table (status text, count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select status, count(*)
  from store_orders
  where (p_is_sandbox is null or is_sandbox = p_is_sandbox)
    and (p_requires_shipping is null or requires_shipping_address = p_requires_shipping)
  group by status
$$;

revoke execute on function public.count_orders_by_status(boolean, boolean) from public, anon, authenticated;
grant execute on function public.count_orders_by_status(boolean, boolean) to service_role;
