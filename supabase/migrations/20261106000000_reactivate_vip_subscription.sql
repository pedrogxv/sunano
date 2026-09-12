-- Reativação de assinatura VIP dentro do período já pago.
--
-- O PROBLEMA QUE ISTO RESOLVE
-- ---------------------------
-- Quem cancelava a assinatura e voltava atrás ANTES de o VIP vencer estava
-- comprando um mês a mais, não desfazendo o cancelamento:
--
--   • PIX: `POST /api/vip/subscribe` criava a assinatura com
--     `nextDueDate = hoje`, ignorando o cálculo que já existia para o
--     cartão. A Asaas gerava o QR na hora. Cancelar e reativar no mesmo dia
--     = mais R$ 8,90 por um mês que já estava pago. Repetindo o ciclo todo
--     dia, o usuário pagava N meses adiantado num dia só.
--
--   • Cartão: o checkout hospedado (chargeTypes RECURRENT) cobra a 1ª
--     parcela no ato, então a reativação também cobrava imediatamente.
--
-- Em nenhum dos dois o dinheiro sumia — `activate_vip_subscription` soma
-- `greatest(now(), vip_expires_at) + 1 month`, então os meses se
-- acumulavam. Mas o usuário pagava ANTECIPADO por tempo que já possuía, sem
-- ter pedido isso.
--
-- A CORREÇÃO
-- ----------
-- Reativar passa a ser uma operação sem cobrança: a assinatura na Asaas é
-- criada com a 1ª cobrança agendada para `vip_expires_at` (a Asaas define
-- `nextDueDate` como o vencimento da primeira cobrança, e aceita data
-- futura). Nada é cobrado hoje; a recorrência simplesmente volta a valer a
-- partir do dia em que o acesso atual acabaria.
--
-- Esta RPC grava o lado local dessa operação. Ela é a única que cria uma
-- linha de assinatura já `active` sem passar por um pagamento — o que é
-- correto justamente porque o pagamento que sustenta esse período já
-- aconteceu, no ciclo anterior ao cancelamento.

create or replace function public.reactivate_vip_subscription(
  p_id                    uuid,
  p_user_id               uuid,
  p_asaas_customer_id     text,
  p_payment_method        text,
  p_asaas_subscription_id text,
  p_current_period_end    timestamptz
) returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_vip_expires_at timestamptz;
  v_account_tier   text;
begin
  if p_payment_method not in ('credit_card', 'pix') then
    raise exception 'invalid_payment_method';
  end if;

  -- Trava a linha do perfil e reconfere o estado que autoriza a reativação.
  -- A checagem existe no route, mas repetir aqui fecha a corrida entre dois
  -- POSTs simultâneos: sem isto, dois cliques quase juntos poderiam criar
  -- duas assinaturas na Asaas para o mesmo usuário.
  select vip_expires_at, account_tier
    into v_vip_expires_at, v_account_tier
  from public.user_profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'user_not_found';
  end if;

  -- Reativação SÓ é válida com VIP ainda correndo. Sem período pago restante
  -- não há o que reativar: seria uma assinatura nova, que precisa passar
  -- pelo fluxo normal (com cobrança) — jamais ganhar `active` de graça.
  if v_account_tier <> 'vip' or v_vip_expires_at is null or v_vip_expires_at <= now() then
    raise exception 'no_paid_period_to_reactivate';
  end if;

  -- `user_id` é UNIQUE: recicla a linha existente preservando a PK, mesmo
  -- motivo documentado em `createSubscriptionRecord` — trocar a PK quebra a
  -- FK de `vip_subscription_payments` de quem já pagou algum ciclo.
  insert into public.vip_subscriptions as s (
    id, user_id, asaas_checkout_id, asaas_subscription_id, asaas_customer_id,
    status, payment_method, pending_payment_id, current_period_end,
    canceled_at, updated_at
  )
  values (
    p_id, p_user_id, null, p_asaas_subscription_id, p_asaas_customer_id,
    'active', p_payment_method, null, p_current_period_end,
    null, now()
  )
  on conflict (user_id) do update
  set asaas_subscription_id = excluded.asaas_subscription_id,
      asaas_customer_id     = excluded.asaas_customer_id,
      asaas_checkout_id     = null,
      status                = 'active',
      payment_method        = excluded.payment_method,
      -- Não há cobrança em aberto: a 1ª vence só no fim do período pago.
      pending_payment_id    = null,
      current_period_end    = excluded.current_period_end,
      -- Limpar `canceled_at` é o que torna isto uma reativação de fato — a
      -- aba de assinatura usa esse campo para decidir se mostra o card de
      -- "assinatura cancelada".
      canceled_at           = null,
      updated_at            = now();

  -- `user_profiles` NÃO é tocado de propósito: `vip_expires_at` já está
  -- correto e `account_tier` já é 'vip'. Reativar não concede tempo — só
  -- religa a cobrança futura.

  return true;
end;
$$;

comment on function public.reactivate_vip_subscription(uuid, uuid, text, text, text, timestamptz) is
  'Reativa a assinatura de quem cancelou e ainda está dentro do período pago. Cria/recicla a linha já como active, com a 1ª cobrança agendada na Asaas para current_period_end — nenhuma cobrança é feita no ato. Não altera vip_expires_at nem account_tier: o acesso já existe e já foi pago. Exige VIP ativo (raise no-op caso contrário), então nunca concede assinatura ativa sem período pago por trás.';

revoke execute on function public.reactivate_vip_subscription(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reactivate_vip_subscription(uuid, uuid, text, text, text, timestamptz) to service_role;
