-- RPCs de ciclo de vida da assinatura VIP — chamadas pelo webhook
-- (app/api/webhooks/asaas-subscription/route.ts) e pelo endpoint de
-- cancelamento (app/api/vip/cancel). Mesmo padrão de purchase_vip_with_aura
-- (20260921130003_aura_vip_and_display_name.sql): lock via `for update`,
-- security definer, revocado de anon/authenticated, só service_role chama.

-- ────────────────────────────────────────────
-- 1. activate_vip_subscription — 1º pagamento de uma assinatura recém-criada
--
-- Chamada no webhook CHECKOUT_PAID: nesse ponto já resolvemos o payment real
-- via getPaymentsByCheckoutSession(checkoutId), cujo payment.subscription é
-- o asaas_subscription_id real (só existe a partir daqui). Localiza a linha
-- por asaas_checkout_id (criada em POST /api/vip/subscribe com esse id como
-- externalReference), preenche asaas_subscription_id, e delega a mesma
-- lógica de crédito de renew_vip_subscription (idempotente).
-- ────────────────────────────────────────────
create or replace function public.activate_vip_subscription(
  p_asaas_checkout_id     text,
  p_asaas_subscription_id text,
  p_asaas_payment_id      text
) returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_sub_id  uuid;
  v_user_id uuid;
begin
  if exists (select 1 from public.vip_subscription_payments where asaas_payment_id = p_asaas_payment_id) then
    return false;
  end if;

  select id, user_id into v_sub_id, v_user_id
  from public.vip_subscriptions
  where asaas_checkout_id = p_asaas_checkout_id
  for update;

  if not found then
    raise exception 'subscription_not_found';
  end if;

  update public.vip_subscriptions
  set asaas_subscription_id = coalesce(asaas_subscription_id, p_asaas_subscription_id),
      status = 'active',
      current_period_end = greatest(now(), coalesce(current_period_end, now())) + interval '1 month',
      updated_at = now()
  where id = v_sub_id;

  update public.user_profiles
  set account_tier = 'vip',
      vip_expires_at = greatest(now(), coalesce(vip_expires_at, now())) + interval '1 month'
  where id = v_user_id;

  insert into public.vip_subscription_payments (asaas_payment_id, subscription_id)
  values (p_asaas_payment_id, v_sub_id);

  return true;
end;
$$;

-- ────────────────────────────────────────────
-- 2. renew_vip_subscription — ciclos seguintes (PAYMENT_CONFIRMED/RECEIVED
--    com payment.subscription já preenchido, assinatura já ativada antes).
-- ────────────────────────────────────────────
create or replace function public.renew_vip_subscription(
  p_asaas_subscription_id text,
  p_asaas_payment_id      text
) returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_sub_id  uuid;
  v_user_id uuid;
begin
  if exists (select 1 from public.vip_subscription_payments where asaas_payment_id = p_asaas_payment_id) then
    return false;
  end if;

  select id, user_id into v_sub_id, v_user_id
  from public.vip_subscriptions
  where asaas_subscription_id = p_asaas_subscription_id
  for update;

  if not found then
    raise exception 'subscription_not_found';
  end if;

  update public.vip_subscriptions
  set status = 'active',
      current_period_end = greatest(now(), coalesce(current_period_end, now())) + interval '1 month',
      updated_at = now()
  where id = v_sub_id;

  update public.user_profiles
  set account_tier = 'vip',
      vip_expires_at = greatest(now(), coalesce(vip_expires_at, now())) + interval '1 month'
  where id = v_user_id;

  insert into public.vip_subscription_payments (asaas_payment_id, subscription_id)
  values (p_asaas_payment_id, v_sub_id);

  return true;
end;
$$;

-- ────────────────────────────────────────────
-- 3. mark_vip_subscription_past_due — cobrança do ciclo atrasada
--    (PAYMENT_OVERDUE). Não mexe em vip_expires_at/account_tier: dá
--    benefício da dúvida até a expiração real — o cron de expiração
--    (expire_vip_accounts) cuida se a Asaas não conseguir regularizar.
-- ────────────────────────────────────────────
create or replace function public.mark_vip_subscription_past_due(p_asaas_subscription_id text)
returns boolean
language plpgsql security definer
set search_path = public as $$
begin
  update public.vip_subscriptions
  set status = 'past_due', updated_at = now()
  where asaas_subscription_id = p_asaas_subscription_id
    and status = 'active';
  return found;
end;
$$;

-- ────────────────────────────────────────────
-- 4. cancel_vip_subscription — cancelamento, por user_id (endpoint
--    /api/vip/cancel, ação direta do usuário) ou por asaas_subscription_id
--    (webhook SUBSCRIPTION_DELETED, cancelamento feito no painel Asaas).
--    Não mexe em vip_expires_at: usuário mantém acesso até o fim do período
--    já pago, padrão de mercado. Idempotente via WHERE status IN (...).
-- ────────────────────────────────────────────
create or replace function public.cancel_vip_subscription(
  p_user_id uuid default null,
  p_asaas_subscription_id text default null
) returns boolean
language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id is null and p_asaas_subscription_id is null then
    raise exception 'missing_identifier';
  end if;

  update public.vip_subscriptions
  set status = 'canceled', canceled_at = now(), updated_at = now()
  where status in ('active', 'past_due', 'pending')
    and (
      (p_user_id is not null and user_id = p_user_id)
      or (p_asaas_subscription_id is not null and asaas_subscription_id = p_asaas_subscription_id)
    );

  return found;
end;
$$;

revoke execute on function public.activate_vip_subscription(text, text, text) from public, anon, authenticated;
revoke execute on function public.renew_vip_subscription(text, text) from public, anon, authenticated;
revoke execute on function public.mark_vip_subscription_past_due(text) from public, anon, authenticated;
revoke execute on function public.cancel_vip_subscription(uuid, text) from public, anon, authenticated;
grant execute on function public.activate_vip_subscription(text, text, text) to service_role;
grant execute on function public.renew_vip_subscription(text, text) to service_role;
grant execute on function public.mark_vip_subscription_past_due(text) to service_role;
grant execute on function public.cancel_vip_subscription(uuid, text) to service_role;
