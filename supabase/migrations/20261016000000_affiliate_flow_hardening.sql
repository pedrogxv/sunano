-- Endurecimento do fluxo de afiliado.
--
-- CONTEXTO IMPORTANTE: a migration 20261001000000_affiliate_payout_flow.sql
-- está registrada como aplicada em `schema_migrations`, mas o SQL dela nunca
-- rodou no remoto — verificado por conteúdo:
--
--   select pg_get_function_result(oid) from pg_proc
--   where proname = 'request_affiliate_payout';   -- devolvia `uuid`
--
-- Ou seja: o banco tinha a versão ANTIGA (retorno `uuid`), enquanto
-- `affiliates-repository.ts` já lia `data.ok` — um uuid não tem `.ok`, então
-- TODO saque bem-sucedido era reportado ao usuário como falha, e
-- `cancel_affiliate_payout` / `affiliate_min_payout_cents` simplesmente não
-- existiam (botão "cancelar saque" quebrado, sem mínimo e sem teto de
-- pendentes). Este arquivo é idempotente e recria as três funções do zero,
-- então serve tanto para bancos que receberam aquela migration quanto para os
-- que não receberam.
--
-- Aqui também entram as correções de regra que faltavam:
--   1. afiliado suspenso não pode mais receber crédito de venda nova;
--   2. saque exige saldo POSITIVO real (saldo negativo por estorno não saca);
--   3. saldo negativo é levado em conta no cálculo de disponível.

-- ---------------------------------------------------------------------------
-- Mínimo de saque (recriado — não existia no remoto)
-- ---------------------------------------------------------------------------
create or replace function public.affiliate_min_payout_cents()
returns integer
language sql
immutable
as $$ select 2000 $$;

-- ---------------------------------------------------------------------------
-- Crédito/débito de comissão
-- ---------------------------------------------------------------------------
-- Mudança em relação a 20260921000001: o crédito de uma venda NOVA passa a ser
-- recusado quando o afiliado não está `approved`. Antes, a checagem de status
-- existia só no TypeScript (`creditCommissionForOrder` selecionava `status` e
-- nunca o testava), então suspender um afiliado por fraude não impedia que as
-- vendas seguintes continuassem creditando — o dinheiro continuava saindo.
--
-- A regra vale só para `credit`: `refund_debit` e `adjustment` precisam
-- continuar funcionando em afiliado suspenso, senão suspender alguém
-- congelaria justamente os estornos das vendas que motivaram a suspensão.
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
  v_status text;
begin
  if p_type = 'credit' then
    select status into v_status from public.affiliates where id = p_affiliate_id;
    if v_status is distinct from 'approved' then
      return null;
    end if;

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

-- ---------------------------------------------------------------------------
-- Solicitação de saque
-- ---------------------------------------------------------------------------
-- Recriada com retorno jsonb (`ok` + `code`), teto de 3 pendentes e mínimo —
-- o que a 20261001000000 pretendia entregar e não entregou.
--
-- Acréscimo desta migration: `greatest(v_balance, 0)` no cálculo do
-- disponível. Saldo pode ficar negativo de propósito (estorno depois do saque,
-- ver `apply_affiliate_commission_event`), e sem essa guarda um saldo de
-- -R$ 50 com R$ 0 reservado produzia `v_available = -50` — o que já barrava o
-- saque, mas devolvia "disponível: -R$ 50,00" na mensagem de erro. Agora o
-- piso é zero e a pendência fica registrada para ser compensada por créditos
-- futuros, que é o comportamento que a tela descreve.
--
-- Códigos: not_found | below_minimum | insufficient_balance | too_many_pending
drop function if exists public.request_affiliate_payout(uuid, integer, text, text);

create or replace function public.request_affiliate_payout(
  p_affiliate_id uuid,
  p_amount_cents integer,
  p_pix_key text,
  p_pix_key_type text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_balance integer;
  v_reserved integer;
  v_available integer;
  v_pending_count integer;
  v_min integer := public.affiliate_min_payout_cents();
  v_payout_id uuid;
begin
  select balance_cents into v_balance
  from public.affiliates
  where id = p_affiliate_id
  for update;

  if v_balance is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select coalesce(sum(amount_cents), 0), count(*)
  into v_reserved, v_pending_count
  from public.affiliate_payout_requests
  where affiliate_id = p_affiliate_id and status = 'requested';

  -- Piso em zero: saldo negativo é pendência, não crédito sacável.
  v_available := greatest(v_balance, 0) - v_reserved;

  -- Teto de saques simultâneos em análise: sem isso, dá para picotar o saldo
  -- em dezenas de pedidos de R$ 20 e entupir a fila do admin.
  if v_pending_count >= 3 then
    return jsonb_build_object('ok', false, 'code', 'too_many_pending');
  end if;

  if p_amount_cents < v_min then
    return jsonb_build_object('ok', false, 'code', 'below_minimum', 'min_cents', v_min);
  end if;

  if p_amount_cents > v_available then
    return jsonb_build_object(
      'ok', false,
      'code', 'insufficient_balance',
      'available_cents', greatest(v_available, 0)
    );
  end if;

  insert into public.affiliate_payout_requests (affiliate_id, amount_cents, pix_key, pix_key_type, status)
  values (p_affiliate_id, p_amount_cents, p_pix_key, p_pix_key_type, 'requested')
  returning id into v_payout_id;

  -- Guarda a chave usada no perfil para pré-preencher o próximo saque.
  update public.affiliates
  set pix_key = p_pix_key,
      pix_key_type = p_pix_key_type,
      updated_at = now()
  where id = p_affiliate_id;

  return jsonb_build_object('ok', true, 'payout_id', v_payout_id, 'available_cents', v_available - p_amount_cents);
end;
$$;

revoke execute on function public.request_affiliate_payout(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.request_affiliate_payout(uuid, integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Cancelamento pelo próprio afiliado (não existia no remoto)
-- ---------------------------------------------------------------------------
-- O `affiliate_id` entra no WHERE (e não só o id do saque) para que um id
-- vazado não permita cancelar o saque de outra pessoa; e o status no WHERE
-- fecha a corrida com o admin aprovando no mesmo instante — quem chegar
-- segundo não altera nada e recebe `ok:false`.
create or replace function public.cancel_affiliate_payout(
  p_affiliate_id uuid,
  p_payout_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_updated uuid;
begin
  update public.affiliate_payout_requests
  set status = 'cancelled'
  where id = p_payout_id
    and affiliate_id = p_affiliate_id
    and status = 'requested'
  returning id into v_updated;

  if v_updated is null then
    return jsonb_build_object('ok', false, 'code', 'not_cancellable');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.cancel_affiliate_payout(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_affiliate_payout(uuid, uuid) to service_role;
