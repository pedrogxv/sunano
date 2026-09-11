-- Assinatura VIP paga com PIX.
--
-- POR QUE UMA MIGRATION É NECESSÁRIA
-- ---------------------------------
-- `vip_subscriptions` nasceu assumindo UM caminho: Asaas Checkout hospedado
-- com cartão (chargeTypes: ["RECURRENT"]), onde a linha é criada com o
-- `asaas_checkout_id` e só ganha `asaas_subscription_id` quando o cliente
-- paga a 1ª cobrança na página hospedada.
--
-- O PIX não passa por checkout hospedado: `POST /v3/checkouts` com
-- `chargeTypes: ["RECURRENT"]` aceita SOMENTE `CREDIT_CARD` — PIX não é
-- combinável com RECURRENT lá. A assinatura PIX é criada direto em
-- `POST /v3/subscriptions` (que aceita `billingType: "PIX"`), então:
--   • não existe checkout  -> `asaas_checkout_id` precisa aceitar NULL;
--   • a assinatura existe desde o primeiro instante -> `asaas_subscription_id`
--     já nasce preenchido, ao contrário do cartão.
--
-- A recorrência é a MESMA em ambos: ciclo MONTHLY, a Asaas gera a cobrança
-- de cada mês e o acesso só avança quando ela é confirmada. A diferença é
-- que no PIX o usuário paga o QR de cada ciclo manualmente (não é Pix
-- Automático, que exigiria autorização de débito recorrente do pagador).

-- 1. `asaas_checkout_id` passa a aceitar NULL (assinatura PIX não tem um).
--    O UNIQUE é preservado: em Postgres, várias linhas NULL não conflitam
--    entre si num índice único, então isso não limita quantas assinaturas
--    PIX podem coexistir.
alter table public.vip_subscriptions
  alter column asaas_checkout_id drop not null;

comment on column public.vip_subscriptions.asaas_checkout_id is
  'ID do Asaas Checkout hospedado — SOMENTE no fluxo de cartão, onde a assinatura ainda não existe no momento da criação da linha. NULL nas assinaturas PIX, criadas direto em POST /v3/subscriptions (o checkout hospedado não aceita PIX com chargeTypes RECURRENT), que já nascem com asaas_subscription_id preenchido.';

-- 2. Método de pagamento da assinatura. Não é cosmético: decide se o
--    cancelamento/reconciliação pode consultar a Asaas pelo
--    `asaas_subscription_id` desde o início (PIX) ou só após o 1º pagamento
--    (cartão), e decide qual UI a aba "Assinatura" mostra.
alter table public.vip_subscriptions
  add column if not exists payment_method text not null default 'credit_card'
    check (payment_method in ('credit_card', 'pix'));

comment on column public.vip_subscriptions.payment_method is
  'credit_card = Asaas Checkout hospedado com cartão tokenizado, renovação automática. pix = assinatura PIX criada direto na API; a Asaas gera o QR de cada ciclo e o usuário paga manualmente todo mês.';

-- 3. Cobrança PIX do ciclo em aberto — o que a UI precisa para mostrar o QR
--    code sem consultar a Asaas a cada render. Atualizada pelo webhook
--    PAYMENT_CREATED (novo ciclo) e limpa quando o pagamento é confirmado.
--
--    O QR code em si (imagem base64 + payload copia-e-cola) NÃO é guardado:
--    é grande, tem validade própria e a Asaas o serve sob demanda em
--    `GET /v3/payments/{id}/pixQrCode`. Guardamos só o ID da cobrança.
alter table public.vip_subscriptions
  add column if not exists pending_payment_id text null;

comment on column public.vip_subscriptions.pending_payment_id is
  'asaas payment id da cobrança PIX do ciclo atual ainda não paga. O QR code é buscado sob demanda na Asaas a partir daqui. NULL quando não há cobrança em aberto (ciclo já pago, ou assinatura no cartão).';

create index if not exists idx_vip_subscriptions_pending_payment
  on public.vip_subscriptions(pending_payment_id)
  where pending_payment_id is not null;

-- ────────────────────────────────────────────
-- 4. activate_vip_subscription_pix — 1º pagamento de uma assinatura PIX.
--
-- Equivalente ao `activate_vip_subscription` do cartão, mas localiza a linha
-- por `asaas_subscription_id` (que no PIX já existe desde a criação) em vez
-- de `asaas_checkout_id` (que não existe nesse fluxo).
--
-- Idempotente pelo mesmo mecanismo: `vip_subscription_payments` tem o
-- payment id como PK, então uma reentrega do webhook não credita 2 meses.
-- ────────────────────────────────────────────
create or replace function public.activate_vip_subscription_pix(
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
      -- A cobrança em aberto acabou de ser paga: não há mais QR pendente.
      pending_payment_id = null,
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
-- 5. set_vip_subscription_pending_payment — nova cobrança PIX gerada pela
--    Asaas para o próximo ciclo (webhook PAYMENT_CREATED).
--
-- Guarda o payment id para a UI conseguir mostrar o QR do mês. Só grava se a
-- cobrança ainda não foi processada — uma reentrega de PAYMENT_CREATED
-- depois de o usuário já ter pago não pode ressuscitar um QR morto.
-- ────────────────────────────────────────────
create or replace function public.set_vip_subscription_pending_payment(
  p_asaas_subscription_id text,
  p_asaas_payment_id      text
) returns boolean
language plpgsql security definer
set search_path = public as $$
begin
  if exists (select 1 from public.vip_subscription_payments where asaas_payment_id = p_asaas_payment_id) then
    return false;
  end if;

  update public.vip_subscriptions
  set pending_payment_id = p_asaas_payment_id,
      updated_at = now()
  where asaas_subscription_id = p_asaas_subscription_id
    and status in ('pending', 'active', 'past_due');

  return found;
end;
$$;

-- ────────────────────────────────────────────
-- 6. `renew_vip_subscription` reescrita para limpar `pending_payment_id`.
--
-- Renovação confirmada = a cobrança do ciclo foi paga, o QR pendente deixa
-- de existir. Sem isto a UI seguiria mostrando "pague este QR" para um mês
-- já quitado. O resto do corpo é idêntico ao de 20260922000004 — repetido
-- aqui na íntegra porque `create or replace function` substitui o corpo
-- inteiro, não faz merge.
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
      pending_payment_id = null,
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

revoke execute on function public.activate_vip_subscription_pix(text, text) from public, anon, authenticated;
revoke execute on function public.set_vip_subscription_pending_payment(text, text) from public, anon, authenticated;
grant execute on function public.activate_vip_subscription_pix(text, text) to service_role;
grant execute on function public.set_vip_subscription_pending_payment(text, text) to service_role;
