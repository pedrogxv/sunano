-- Plano ANUAL de VIP (R$ 89,90/ano) ao lado do mensal (R$ 8,90/mês).
--
-- O PROBLEMA DE SEGURANÇA QUE MOLDA ESTA MIGRATION
-- ------------------------------------------------
-- Até aqui toda RPC de pagamento somava `interval '1 month'` fixo. O caminho
-- óbvio para suportar anual seria passar o período como PARÂMETRO das RPCs, a
-- partir do que o webhook recebe. Isso seria uma brecha de escalação de
-- acesso: o webhook é alimentado pela Asaas, e quem conseguisse adulterar uma
-- cobrança no painel (ou costurar/reenviar um evento) pediria 12 meses tendo
-- pago 1 mês. É a mesma classe de erro do preço da loja, que já nos custou um
-- incidente: quem decide o que foi comprado nunca pode ser quem paga.
--
-- A regra aqui é a inversa: o período é gravado na LINHA da assinatura no
-- instante em que ela é criada, pelo servidor, a partir do catálogo hardcoded
-- de `lib/vip-plan.ts`. As RPCs LEEM o intervalo da linha travada por
-- `for update`. O webhook segue dizendo apenas "este pagamento foi
-- confirmado" — nunca "conceda este tanto de tempo".
--
-- Consequência direta: uma assinatura mensal cuja cobrança viesse com valor
-- anual ainda concede 1 mês, e o valor fora de faixa é barrado antes disso no
-- route (validação por plano). Não existe combinação de payload que compre
-- tempo mais barato.

-- ────────────────────────────────────────────
-- 1. billing_period na linha da assinatura
--
-- `default 'monthly'` cobre as linhas existentes: toda assinatura criada até
-- hoje é mensal, então o backfill é o próprio default — nenhuma delas muda de
-- comportamento.
-- ────────────────────────────────────────────
alter table public.vip_subscriptions
  add column if not exists billing_period text not null default 'monthly'
    check (billing_period in ('monthly', 'yearly'));

comment on column public.vip_subscriptions.billing_period is
  'monthly = R$ 8,90 a cada mês (cycle MONTHLY na Asaas). yearly = R$ 89,90 a cada 12 meses (cycle YEARLY). ESCRITO PELO SERVIDOR na criação da assinatura, a partir do catálogo de lib/vip-plan.ts — as RPCs de pagamento leem o intervalo de acesso DAQUI, nunca de um parâmetro vindo do webhook, senão um evento adulterado compraria 12 meses pelo preço de 1.';

-- ────────────────────────────────────────────
-- 2. vip_access_interval — tradução única de período -> intervalo
--
-- Toda RPC que concede acesso chama esta função em vez de embutir o
-- `interval`. Ponto único: se um 3º plano aparecer, é aqui que ele entra, e
-- nenhuma RPC pode discordar das outras sobre quanto tempo um plano vale.
--
-- Qualquer valor inesperado cai em 1 mês (o menor plano). Defensivo de
-- propósito — o check constraint já impede outros valores, mas se algum dia
-- ele for relaxado o pior caso aqui é conceder MENOS tempo, nunca mais.
-- ────────────────────────────────────────────
create or replace function public.vip_access_interval(p_billing_period text)
returns interval
language sql immutable
set search_path = public as $$
  select case p_billing_period
    when 'yearly' then interval '12 months'
    else interval '1 month'
  end;
$$;

comment on function public.vip_access_interval(text) is
  'Quanto tempo de VIP uma cobrança confirmada concede, por período de cobrança. Fonte única usada por activate/renew/activate_pix — nunca embutir interval literal nessas RPCs. Valor desconhecido devolve 1 mês (falha para o menor acesso, nunca para o maior).';

-- ────────────────────────────────────────────
-- 3. activate_vip_subscription — 1º pagamento no CARTÃO (CHECKOUT_PAID)
--
-- Corpo repetido na íntegra: `create or replace function` substitui o corpo
-- inteiro, não faz merge. Única mudança real contra 20260922000004: o
-- intervalo sai de `vip_access_interval(billing_period da linha)`.
-- ────────────────────────────────────────────
create or replace function public.activate_vip_subscription(
  p_asaas_checkout_id     text,
  p_asaas_subscription_id text,
  p_asaas_payment_id      text
) returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_sub_id   uuid;
  v_user_id  uuid;
  v_interval interval;
begin
  if exists (select 1 from public.vip_subscription_payments where asaas_payment_id = p_asaas_payment_id) then
    return false;
  end if;

  -- O período vem da LINHA (travada), não de um parâmetro. Ver o cabeçalho.
  select id, user_id, public.vip_access_interval(billing_period)
    into v_sub_id, v_user_id, v_interval
  from public.vip_subscriptions
  where asaas_checkout_id = p_asaas_checkout_id
  for update;

  if not found then
    raise exception 'subscription_not_found';
  end if;

  update public.vip_subscriptions
  set asaas_subscription_id = coalesce(asaas_subscription_id, p_asaas_subscription_id),
      status = 'active',
      current_period_end = greatest(now(), coalesce(current_period_end, now())) + v_interval,
      updated_at = now()
  where id = v_sub_id;

  update public.user_profiles
  set account_tier = 'vip',
      vip_expires_at = greatest(now(), coalesce(vip_expires_at, now())) + v_interval
  where id = v_user_id;

  insert into public.vip_subscription_payments (asaas_payment_id, subscription_id)
  values (p_asaas_payment_id, v_sub_id);

  return true;
end;
$$;

-- ────────────────────────────────────────────
-- 4. renew_vip_subscription — ciclos seguintes (cartão e PIX)
--
-- Mantém a limpeza de `pending_payment_id` introduzida em 20261101000000 (o
-- QR do ciclo pago deixa de existir) e troca o intervalo pela função.
-- ────────────────────────────────────────────
create or replace function public.renew_vip_subscription(
  p_asaas_subscription_id text,
  p_asaas_payment_id      text
) returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_sub_id   uuid;
  v_user_id  uuid;
  v_interval interval;
begin
  if exists (select 1 from public.vip_subscription_payments where asaas_payment_id = p_asaas_payment_id) then
    return false;
  end if;

  select id, user_id, public.vip_access_interval(billing_period)
    into v_sub_id, v_user_id, v_interval
  from public.vip_subscriptions
  where asaas_subscription_id = p_asaas_subscription_id
  for update;

  if not found then
    raise exception 'subscription_not_found';
  end if;

  update public.vip_subscriptions
  set status = 'active',
      current_period_end = greatest(now(), coalesce(current_period_end, now())) + v_interval,
      pending_payment_id = null,
      updated_at = now()
  where id = v_sub_id;

  update public.user_profiles
  set account_tier = 'vip',
      vip_expires_at = greatest(now(), coalesce(vip_expires_at, now())) + v_interval
  where id = v_user_id;

  insert into public.vip_subscription_payments (asaas_payment_id, subscription_id)
  values (p_asaas_payment_id, v_sub_id);

  return true;
end;
$$;

-- ────────────────────────────────────────────
-- 5. activate_vip_subscription_pix — 1º pagamento no PIX
--
-- No PIX a assinatura já existe na Asaas desde a criação, então localiza por
-- `asaas_subscription_id`. Mesmo intervalo por período.
-- ────────────────────────────────────────────
create or replace function public.activate_vip_subscription_pix(
  p_asaas_subscription_id text,
  p_asaas_payment_id      text
) returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_sub_id   uuid;
  v_user_id  uuid;
  v_interval interval;
begin
  if exists (select 1 from public.vip_subscription_payments where asaas_payment_id = p_asaas_payment_id) then
    return false;
  end if;

  select id, user_id, public.vip_access_interval(billing_period)
    into v_sub_id, v_user_id, v_interval
  from public.vip_subscriptions
  where asaas_subscription_id = p_asaas_subscription_id
  for update;

  if not found then
    raise exception 'subscription_not_found';
  end if;

  update public.vip_subscriptions
  set status = 'active',
      current_period_end = greatest(now(), coalesce(current_period_end, now())) + v_interval,
      pending_payment_id = null,
      updated_at = now()
  where id = v_sub_id;

  update public.user_profiles
  set account_tier = 'vip',
      vip_expires_at = greatest(now(), coalesce(vip_expires_at, now())) + v_interval
  where id = v_user_id;

  insert into public.vip_subscription_payments (asaas_payment_id, subscription_id)
  values (p_asaas_payment_id, v_sub_id);

  return true;
end;
$$;

-- ────────────────────────────────────────────
-- 6. reactivate_vip_subscription passa a gravar o período escolhido
--
-- Reativar continua SEM cobrar nada (a 1ª cobrança é agendada para o fim do
-- período já pago), mas o usuário pode reativar TROCANDO de plano — quem
-- cancelou o mensal pode voltar no anual. O período precisa ser gravado agora
-- porque é ele que a RPC de renovação vai ler quando aquela cobrança agendada
-- for confirmada; deixar o valor antigo faria um reativado-no-anual receber
-- 1 mês por uma cobrança de R$ 89,90.
--
-- `p_billing_period` aqui NÃO vem do webhook: vem de POST /api/vip/subscribe,
-- que o resolve pelo catálogo do servidor a partir da escolha do usuário e
-- cria a assinatura na Asaas com o ciclo e o valor correspondentes. É o mesmo
-- caminho autenticado que cria uma assinatura nova.
-- ────────────────────────────────────────────
-- O 7º parâmetro tem default, mas no Postgres cada aritmética de argumentos é
-- uma assinatura própria: `create or replace` com 7 args CRIA uma função nova
-- em vez de substituir a de 6, e as duas coexistindo tornam ambígua qualquer
-- chamada com 6 argumentos (erro 42725). A antiga sai ANTES da nova entrar.
drop function if exists public.reactivate_vip_subscription(uuid, uuid, text, text, text, timestamptz);

create or replace function public.reactivate_vip_subscription(
  p_id                    uuid,
  p_user_id               uuid,
  p_asaas_customer_id     text,
  p_payment_method        text,
  p_asaas_subscription_id text,
  p_current_period_end    timestamptz,
  p_billing_period        text default 'monthly'
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

  if p_billing_period not in ('monthly', 'yearly') then
    raise exception 'invalid_billing_period';
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
    status, payment_method, billing_period, pending_payment_id,
    current_period_end, canceled_at, updated_at
  )
  values (
    p_id, p_user_id, null, p_asaas_subscription_id, p_asaas_customer_id,
    'active', p_payment_method, p_billing_period, null,
    p_current_period_end, null, now()
  )
  on conflict (user_id) do update
  set asaas_subscription_id = excluded.asaas_subscription_id,
      asaas_customer_id     = excluded.asaas_customer_id,
      asaas_checkout_id     = null,
      status                = 'active',
      payment_method        = excluded.payment_method,
      -- O plano da reativação substitui o anterior: é ele que a Asaas passou
      -- a cobrar, e é dele que a renovação vai tirar o intervalo de acesso.
      billing_period        = excluded.billing_period,
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

comment on function public.reactivate_vip_subscription(uuid, uuid, text, text, text, timestamptz, text) is
  'Reativa a assinatura de quem cancelou e ainda está dentro do período pago, no plano escolhido (mensal ou anual). Cria/recicla a linha já como active, com a 1ª cobrança agendada na Asaas para current_period_end — nenhuma cobrança é feita no ato. Não altera vip_expires_at nem account_tier: o acesso já existe e já foi pago. Exige VIP ativo (raise caso contrário), então nunca concede assinatura ativa sem período pago por trás.';

revoke execute on function public.vip_access_interval(text) from public, anon, authenticated;
revoke execute on function public.reactivate_vip_subscription(uuid, uuid, text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.vip_access_interval(text) to service_role;
grant execute on function public.reactivate_vip_subscription(uuid, uuid, text, text, text, timestamptz, text) to service_role;
