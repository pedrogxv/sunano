-- Fix TOCTOU oversell race condition in store checkout.
--
-- Previously decrement_store_stock() clamped `stock` at 0 with no guard on
-- the UPDATE, so two concurrent Stripe checkouts for the same product could
-- both pass the pre-payment stock check (app/api/store/checkout/route.ts)
-- and both get charged, then both webhook deliveries would call this RPC
-- and both "succeed" — selling more units than were in stock. This makes
-- the decrement atomic (WHERE stock >= p_quantity) and reports back whether
-- it actually happened, so the webhook handler can flag oversold orders for
-- manual review/refund instead of silently pretending it worked.

-- Postgres não permite CREATE OR REPLACE mudar o tipo de retorno (void →
-- boolean); precisa dropar e recriar. Isso também derruba os grants
-- aplicados em 20260718_security_hardening.sql, por isso são reaplicados
-- logo abaixo.
drop function if exists public.decrement_store_stock(uuid, integer);

create function public.decrement_store_stock(p_product_id uuid, p_quantity integer)
returns boolean language plpgsql security definer as $$
declare
  v_updated boolean;
begin
  update public.store_products
  set stock = stock - p_quantity,
      updated_at = now()
  where id = p_product_id and stock >= p_quantity
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

revoke execute on function public.decrement_store_stock(uuid, integer) from public, anon, authenticated;
grant execute on function public.decrement_store_stock(uuid, integer) to service_role;
