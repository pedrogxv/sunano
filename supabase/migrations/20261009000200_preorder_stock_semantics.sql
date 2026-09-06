-- Pré-venda deixa de consumir estoque físico.
--
-- `sale_type` existia só na vitrine: no back-end de compra a pré-venda era
-- tratada como pronta-entrega, então o teto de reservas de um lote que ainda
-- vai chegar era o `stock` atual (zero, no caso normal — um produto em
-- pré-venda não tem estoque). Para vender, o admin era obrigado a inventar um
-- estoque que não existe, ou deixar `stock` nulo e cair no limite diário de 15
-- unidades pensado para produto digital.
--
-- A partir daqui: pré-venda não decrementa estoque; o teto é `preorder_limit`
-- (null = sem teto), contado sobre as reservas já feitas.

alter table public.store_products
  add column if not exists preorder_limit integer;

alter table public.store_products
  drop constraint if exists store_products_preorder_limit_check;
alter table public.store_products
  add constraint store_products_preorder_limit_check
  check (preorder_limit is null or preorder_limit >= 0);

comment on column public.store_products.preorder_limit is
  'Máximo de unidades aceitas em pré-venda (null = sem teto). Só se aplica quando sale_type = pre_order; nesse modo o estoque físico não é decrementado.';

-- Quantas unidades de um produto já foram reservadas em pré-venda.
--
-- Conta as duas coisas que seguram uma vaga:
--   1. pedidos que ainda valem (pagos ou aguardando pagamento);
--   2. reservas em voo no diário `store_stock_reservations` — checkouts que
--      já passaram pela reserva mas ainda não criaram o pedido. Sem esta
--      parcela, dois checkouts simultâneos leem a mesma contagem e ambos
--      passam no teto, vendendo o lote além do limite.
-- Pedidos expirados/cancelados liberam a vaga, igual ao estoque.
create or replace function public.preorder_reserved_quantity(p_product_id uuid)
returns integer language sql stable security definer as $$
  select coalesce((
    select sum((item->>'quantity')::integer)
    from public.store_orders o,
         lateral jsonb_array_elements(o.items) as item
    where o.status in ('pending', 'paid', 'awaiting_shipping_info', 'shipped', 'delivered')
      and item->>'id' = p_product_id::text
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

-- Reserva uma pré-venda: não toca no estoque, só confere o teto. Devolve
-- false quando o lote esgotou, mesmo contrato das RPCs de decremento — assim
-- o checkout trata os dois casos pelo mesmo caminho.
--
-- O lock de advisory serializa as reservas DO MESMO produto: sem ele, dois
-- checkouts simultâneos leem a mesma contagem, ambos passam no teto e o lote
-- é vendido além do limite — exatamente o oversell que as RPCs de estoque
-- evitam com `UPDATE ... WHERE stock >= quantity`. Aqui não há linha para
-- travar (o teto é derivado de uma soma), então o lock é explícito. Ele é
-- liberado no fim da transação, e produtos diferentes não se bloqueiam.
create or replace function public.reserve_preorder(
  p_product_id uuid,
  p_quantity integer,
  p_reservation_group uuid
)
returns boolean language plpgsql security definer as $$
declare
  v_limit integer;
  v_reserved integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_product_id::text, 0));

  select preorder_limit into v_limit
  from public.store_products
  where id = p_product_id and sale_type = 'pre_order';

  -- Não é pré-venda (ou produto não existe): quem chamou errou de RPC.
  if not found then
    return false;
  end if;

  -- Sem teto configurado: aceita, mas ainda registra a reserva para o
  -- checkout ter o mesmo ciclo de vida (baixa no insert do pedido, devolução
  -- pelo cron se a Function morrer).
  if v_limit is null then
    insert into public.store_stock_reservations
      (reservation_group, product_id, variant_id, quantity)
    values (p_reservation_group, p_product_id, null, p_quantity);
    return true;
  end if;

  v_reserved := public.preorder_reserved_quantity(p_product_id);
  if (v_reserved + p_quantity) > v_limit then
    return false;
  end if;

  -- Grava a reserva no MESMO comando que a conferiu: é isto que fecha a
  -- corrida. O checkout já apaga esta linha ao criar o pedido (ou ao
  -- reverter), e o cron devolve o que ficar órfão — mesmo ciclo de vida das
  -- reservas de estoque físico, então nada de novo a manter.
  insert into public.store_stock_reservations
    (reservation_group, product_id, variant_id, quantity)
  values (p_reservation_group, p_product_id, null, p_quantity);

  return true;
end;
$$;

revoke execute on function public.reserve_preorder(uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_preorder(uuid, integer, uuid) to service_role;
