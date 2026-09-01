-- Melhoria do fluxo de saque do afiliado: a RPC deixa de responder um `null`
-- mudo para cinco causas diferentes e passa a devolver um CÓDIGO de erro, e
-- ganha uma irmã para o afiliado cancelar um saque que ainda está em análise.
--
-- IMPORTANTE — aplicar manualmente via Supabase Dashboard (SQL Editor):
-- o histórico de migrations deste projeto está dessincronizado desde 04/08,
-- não rodar via `supabase db push`. Mesma nota de
-- `20260921000001_affiliates_rpcs.sql`.

-- Valor mínimo de saque, em centavos. Fica como constante do banco (e não só
-- do app) porque a guarda de saldo já mora aqui: o mínimo é regra da mesma
-- família e precisa valer para qualquer caller da RPC.
create or replace function public.affiliate_min_payout_cents()
returns integer
language sql
immutable
as $$ select 2000 $$;

-- Substitui a versão que retornava uuid/null. O retorno agora é um json com
-- `ok` + `code`, para a API traduzir cada recusa numa frase que diz o que
-- fazer ("faltam R$ X") em vez do genérico "saldo insuficiente".
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

  v_available := v_balance - v_reserved;

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
      'available_cents', v_available
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

-- Cancelamento pelo próprio afiliado, só enquanto o saque está 'requested'.
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
