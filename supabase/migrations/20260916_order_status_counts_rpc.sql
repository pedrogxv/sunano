-- Contagem de pedidos por status pra fila do admin (blocos de filtro). Antes
-- disso o repositório fazia `select("status")` sem limite e agregava no
-- Node — trazia a tabela `store_orders` inteira (uma linha por pedido) a
-- cada carregamento da página, mesmo pedindo só uma coluna. Um `group by`
-- no Postgres resolve em uma única query e escala com o número de status
-- (7), não com o número de pedidos.
create or replace function public.count_orders_by_status()
returns table (status text, count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select status, count(*)
  from store_orders
  group by status
$$;
