-- Estende cancel_vip_subscription (20260922000004_vip_subscription_rpcs.sql)
-- para aceitar cancelamento por asaas_checkout_id — necessário para os
-- eventos CHECKOUT_EXPIRED/CHECKOUT_CANCELED do webhook de assinatura
-- (app/api/webhooks/asaas-subscription/route.ts): nesse ponto a linha ainda
-- está 'pending' e NUNCA teve asaas_subscription_id preenchido (só existe a
-- partir de CHECKOUT_PAID), então os dois identificadores já existentes
-- (user_id, asaas_subscription_id) não servem para localizar a linha.
--
-- Sem isso, um checkout abandonado/expirado deixa vip_subscriptions presa em
-- 'pending' para sempre, e toda nova tentativa de assinar bate no bloqueio
-- de "assinatura em andamento" (getOngoingSubscriptionForUser).
--
-- Postgres trata funções com assinatura de parâmetros diferente como
-- overloads distintas — precisa dropar a versão de 2 parâmetros para não
-- deixar as duas coexistindo (create or replace não substitui, cria outra).
drop function if exists public.cancel_vip_subscription(uuid, text);

create or replace function public.cancel_vip_subscription(
  p_user_id uuid default null,
  p_asaas_subscription_id text default null,
  p_asaas_checkout_id text default null
) returns boolean
language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id is null and p_asaas_subscription_id is null and p_asaas_checkout_id is null then
    raise exception 'missing_identifier';
  end if;

  update public.vip_subscriptions
  set status = 'canceled', canceled_at = now(), updated_at = now()
  where status in ('active', 'past_due', 'pending')
    and (
      (p_user_id is not null and user_id = p_user_id)
      or (p_asaas_subscription_id is not null and asaas_subscription_id = p_asaas_subscription_id)
      or (p_asaas_checkout_id is not null and asaas_checkout_id = p_asaas_checkout_id)
    );

  return found;
end;
$$;

revoke execute on function public.cancel_vip_subscription(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cancel_vip_subscription(uuid, text, text) to service_role;
