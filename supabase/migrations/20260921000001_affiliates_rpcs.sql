-- RPCs atômicas do sistema de afiliados — mesmo padrão de segurança das RPCs
-- de estoque (`decrement_store_stock`): `security definer`, revogadas de
-- public/anon/authenticated, liberadas só para service_role.
--
-- IMPORTANTE — aplicar manualmente via Supabase Dashboard (SQL Editor): o
-- histórico de migrations deste projeto está dessincronizado desde 04/08,
-- não rodar via `supabase db push`.

-- Insere um evento no ledger e ajusta `affiliates.balance_cents` na mesma
-- transação. Cobre tanto o crédito da venda (`type = 'credit'`, delta
-- positivo) quanto o débito/estorno de reembolso (`type = 'refund_debit'`,
-- delta normalmente negativo, mas aceita positivo para o caso de um estorno
-- ser revertido no Asaas — nesse caso o delta "credita de volta"). Sem
-- guarda de saldo mínimo: saldo pode ficar negativo por decisão de produto
-- (fica registrado como pendência a compensar em saques futuros).
--
-- Idempotência do crédito: usa `on conflict` sobre o índice único parcial
-- `affiliate_commission_events_order_credit_uidx` (order_id where type =
-- 'credit'). Se já existia um crédito para este pedido, não insere de novo e
-- retorna null — quem chamou sabe que não deve subir o saldo de novo.
create or replace function public.apply_affiliate_commission_event(
  p_affiliate_id uuid,
  p_order_id uuid,
  p_delta_cents integer,
  p_type text,
  p_order_total_cents integer,
  p_commission_bps integer,
  p_related_event_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_event_id uuid;
begin
  if p_type = 'credit' then
    insert into public.affiliate_commission_events
      (affiliate_id, order_id, type, amount_cents, order_total_cents, commission_bps, related_event_id, note)
    values
      (p_affiliate_id, p_order_id, 'credit', p_delta_cents, p_order_total_cents, p_commission_bps, p_related_event_id, p_note)
    on conflict (order_id) where (type = 'credit') do nothing
    returning id into v_event_id;

    if v_event_id is null then
      return null;
    end if;
  else
    insert into public.affiliate_commission_events
      (affiliate_id, order_id, type, amount_cents, order_total_cents, commission_bps, related_event_id, note)
    values
      (p_affiliate_id, p_order_id, p_type, p_delta_cents, p_order_total_cents, p_commission_bps, p_related_event_id, p_note)
    returning id into v_event_id;
  end if;

  update public.affiliates
  set balance_cents = balance_cents + p_delta_cents,
      updated_at = now()
  where id = p_affiliate_id;

  return v_event_id;
end;
$$;

revoke execute on function public.apply_affiliate_commission_event(uuid, uuid, integer, text, integer, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_affiliate_commission_event(uuid, uuid, integer, text, integer, integer, uuid, text)
  to service_role;

-- Cria uma solicitação de saque, com guarda atômica de saldo disponível
-- (balance_cents menos saques 'requested' ainda em aberto) — mesmo padrão
-- `WHERE stock >= quantity` do decremento de estoque, calculado dentro da
-- própria função pra não haver corrida entre ler o saldo e gravar o saque.
create or replace function public.request_affiliate_payout(
  p_affiliate_id uuid,
  p_amount_cents integer,
  p_pix_key text,
  p_pix_key_type text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_balance integer;
  v_reserved integer;
  v_available integer;
  v_payout_id uuid;
begin
  select balance_cents into v_balance
  from public.affiliates
  where id = p_affiliate_id
  for update;

  if v_balance is null then
    return null;
  end if;

  select coalesce(sum(amount_cents), 0) into v_reserved
  from public.affiliate_payout_requests
  where affiliate_id = p_affiliate_id and status = 'requested';

  v_available := v_balance - v_reserved;

  if p_amount_cents <= 0 or p_amount_cents > v_available then
    return null;
  end if;

  insert into public.affiliate_payout_requests (affiliate_id, amount_cents, pix_key, pix_key_type, status)
  values (p_affiliate_id, p_amount_cents, p_pix_key, p_pix_key_type, 'requested')
  returning id into v_payout_id;

  return v_payout_id;
end;
$$;

revoke execute on function public.request_affiliate_payout(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.request_affiliate_payout(uuid, integer, text, text) to service_role;
