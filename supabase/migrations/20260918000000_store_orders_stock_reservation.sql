-- Reserva de estoque no momento da criação do pedido (não mais só no
-- webhook pós-pagamento). O checkout passa a decrementar via RPC atômica
-- (decrement_store_stock / decrement_variant_stock, ver
-- 20260724_fix_stock_oversell.sql e 20260813120000_store_product_variants.sql)
-- ANTES de chamar o gateway de PIX, para nunca gerar cobrança quando não há
-- estoque. Isso exige devolver o estoque quando o pedido pending expira sem
-- pagamento, ou quando o próprio checkout falha depois de já ter
-- decrementado (rollback manual — não há transação real via PostgREST).
-- Mesmo padrão de segurança das RPCs de decremento: security definer,
-- revoke de public/anon/authenticated, grant só para service_role.

create or replace function public.increment_store_stock(p_product_id uuid, p_quantity integer)
returns boolean language plpgsql security definer as $$
declare
  v_updated boolean;
begin
  update public.store_products
  set stock = stock + p_quantity,
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
  set stock = stock + p_quantity,
      updated_at = now()
  where id = p_variant_id
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

revoke execute on function public.increment_variant_stock(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_variant_stock(uuid, integer) to service_role;

-- Novo status 'expired': pedido pending cujo PIX venceu sem pagamento.
-- Separado de 'cancelled' (cancelamento manual pelo admin) para o funil de
-- pedidos não misturar "cliente não pagou a tempo" (automático) com "loja
-- cancelou" (decisão humana).
alter table public.store_orders
  drop constraint if exists store_orders_status_check;

alter table public.store_orders
  add constraint store_orders_status_check
  check (status in ('pending', 'paid', 'awaiting_shipping_info', 'shipped', 'delivered', 'cancelled', 'refunded', 'expired'));
