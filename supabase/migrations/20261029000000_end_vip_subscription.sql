-- end_vip_subscription — assinatura encerrada NA ASAAS (webhook
-- SUBSCRIPTION_DELETED em app/api/webhooks/asaas-subscription/route.ts).
--
-- Por que não reusar cancel_vip_subscription (20260922000004):
-- aquela é para cancelamento VOLUNTÁRIO (POST /api/vip/cancel) e mantém
-- `vip_expires_at` de propósito — o usuário pagou o ciclo, usa até o fim.
--
-- Já o SUBSCRIPTION_DELETED normalmente chega porque a Asaas esgotou as
-- tentativas de cobrar um cartão recusado e excluiu a assinatura sozinha.
-- Nesse caso a linha está `past_due` (PAYMENT_OVERDUE marcou antes) e o
-- ciclo atual NÃO foi pago — não há mais nenhuma cobrança para renovar.
-- Segurar `vip_expires_at` no futuro daria ~1 mês de VIP grátis. Então:
--
--   • linha `past_due`  -> corta vip_expires_at para now() (cron de
--                          expiração rebaixa na próxima passada; o helper
--                          is_vip_active/isVipActive já reflete na hora).
--   • linha `active`     -> exclusão por outro motivo, assinatura estava em
--                          dia: mantém o período pago (mesmo tratamento do
--                          cancelamento voluntário).
--   • linha `pending`    -> nunca ativou, não há vip_expires_at nosso para
--                          mexer; só marca canceled.
--
-- Idempotente: 2ª entrega do mesmo evento não acha linha em estado
-- cancelável e volta `false` sem efeito colateral.
create or replace function public.end_vip_subscription(p_asaas_subscription_id text)
returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_user_id uuid;
  v_status  text;
begin
  select user_id, status into v_user_id, v_status
  from public.vip_subscriptions
  where asaas_subscription_id = p_asaas_subscription_id
  for update;

  if not found then
    raise exception 'subscription_not_found';
  end if;

  if v_status not in ('active', 'past_due', 'pending') then
    return false;
  end if;

  update public.vip_subscriptions
  set status = 'canceled', canceled_at = now(), updated_at = now()
  where asaas_subscription_id = p_asaas_subscription_id;

  -- Só encurta o acesso quando o ciclo corrente ficou sem pagamento.
  if v_status = 'past_due' then
    update public.user_profiles
    set vip_expires_at = least(coalesce(vip_expires_at, now()), now())
    where id = v_user_id
      and vip_expires_at is not null;
  end if;

  return true;
end;
$$;

revoke execute on function public.end_vip_subscription(text) from public, anon, authenticated;
grant execute on function public.end_vip_subscription(text) to service_role;
