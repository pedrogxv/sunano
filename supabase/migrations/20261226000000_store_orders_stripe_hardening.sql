-- Endurecimento do Stripe em store_orders (revisao de 13/10/2026).
--
-- 1) Um PaymentIntent pertence a UM pedido. O webhook, o polling e o admin
--    acham o pedido por `stripe_payment_intent_id` com `.maybeSingle()`; duas
--    linhas com o mesmo id derrubariam todos os caminhos de uma vez (e um
--    pagamento ficaria sem pedido liberavel). O indice comum de
--    20261225000000 vira unico (parcial: pedidos Asaas/Aura tem a coluna nula).
--    Conferido em producao antes: zero duplicatas.
--
-- 2) `stripe_session_id` ja tem o indice UNIQUE `store_orders_stripe_session_id_key`,
--    que atende a busca. Os dois btree comuns (`store_orders_session_idx`, da
--    primeira integracao, e `store_orders_stripe_session_id_idx`, de
--    20261225000000) so custam escrita em toda mudanca de pedido.
--
-- 3) `merge_store_order_metadata`: merge ATOMICO de chaves em `metadata`.
--    Os fluxos do Stripe (comprovante, revisao de cartao, aviso de fraude,
--    disputa, tentativa de estorno) faziam ler -> mesclar -> gravar o objeto
--    inteiro; dois eventos simultaneos do mesmo pedido apagavam a chave um do
--    outro. Aqui o merge acontece num UPDATE so (`metadata || patch`).
--    Chave de primeiro nivel: o valor novo SUBSTITUI o antigo daquela chave.
--    `p_require_status` faz o merge valer so se o pedido ainda estiver nesse
--    status (a decisao de reter um cartao nao pode vencer um cancelamento), e
--    `p_pix_expires_at` ajusta o prazo no mesmo UPDATE.
--    SECURITY INVOKER de proposito: roda com o papel de quem chama. Quem chama
--    e a rota (service_role); anon/authenticated nao tem privilegio na tabela.

create unique index if not exists store_orders_stripe_payment_intent_id_key
  on public.store_orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

drop index if exists public.store_orders_stripe_payment_intent_id_idx;
drop index if exists public.store_orders_stripe_session_id_idx;
drop index if exists public.store_orders_session_idx;

create or replace function public.merge_store_order_metadata(
  p_order_id uuid,
  p_patch jsonb,
  p_require_status text default null,
  p_pix_expires_at timestamptz default null
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'p_patch precisa ser um objeto jsonb';
  end if;

  update public.store_orders
     set metadata = coalesce(metadata, '{}'::jsonb) || p_patch,
         pix_expires_at = coalesce(p_pix_expires_at, pix_expires_at),
         updated_at = now()
   where id = p_order_id
     and (p_require_status is null or status = p_require_status);

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke execute on function public.merge_store_order_metadata(uuid, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.merge_store_order_metadata(uuid, jsonb, text, timestamptz)
  to service_role;
