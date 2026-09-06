-- VIP paga 10% a menos em TUDO que custa Aura.
--
-- O desconto já existia em `redeem_aura_item` e `change_display_name_with_aura`
-- (ver 20260922000007_redeem_aura_item_vip_discount.sql, reescritas em
-- 20261006000000_aura_purchases_history.sql), mas dois caminhos de gasto
-- ficaram de fora e cobravam preço cheio de VIP:
--
--   • `purchase_streak_shield` — Proteção de Ofensiva (59/199 Aura).
--   • `claim_event_medal` — medalhas de evento com criteria_type='aura_redeem'.
--
-- O site já anunciava "10% de desconto em toda a Central de Aura"
-- (lib/vip-plan.ts), então isso é o código alcançando a promessa, não uma
-- regra nova.
--
-- Mesma disciplina das RPCs que já tinham desconto: o preço final é decidido
-- e aplicado DENTRO da função `security definer`, lendo `account_tier`/
-- `vip_expires_at` do banco na mesma transação do débito. O client nunca
-- decide o preço — só exibe uma prévia (lib/aura-pricing.ts) calculada a
-- partir do status VIP resolvido no server.
--
-- Continua deliberadamente FORA: `purchase_vip_with_aura`. Essa RPC aborta
-- com `vip_already_active` antes de qualquer débito, então um VIP ativo nunca
-- chega ao ponto de pagar — o desconto ali seria código morto.

-- ────────────────────────────────────────────
-- 1. purchase_streak_shield — 10% off para VIP
--    Assinatura, retorno (grace_days) e erros idênticos aos de
--    20261006000000; muda só o valor debitado e o que vai para
--    `aura_purchases` (list_price cheio, amount_paid com desconto,
--    vip_discount_applied = true), pro admin de compras continuar
--    conseguindo separar receita de tabela de receita real.
-- ────────────────────────────────────────────
create or replace function public.purchase_streak_shield(p_user_id uuid, p_item_id uuid)
returns integer language plpgsql security definer
set search_path = public as $$
declare
  v_aura_cost      integer;
  v_active         boolean;
  v_kind           text;
  v_slug           text;
  v_name           text;
  v_grace          integer;
  v_consumed       timestamptz;
  v_exists         boolean;
  v_balance_before integer;
  v_account_tier   text;
  v_vip_expires_at timestamptz;
  v_is_vip         boolean;
  v_final_cost     integer;
begin
  select aura_cost, active, kind, slug, name
    into v_aura_cost, v_active, v_kind, v_slug, v_name
  from public.aura_items
  where id = p_item_id
  for update;

  if not found or not v_active or v_kind <> 'streak_shield' then
    raise exception 'item_unavailable';
  end if;

  v_grace := case v_slug
    when 'protecao-ofensiva-1d' then 1
    when 'protecao-ofensiva-3d' then 3
    else null
  end;
  if v_grace is null then
    raise exception 'item_unavailable';
  end if;

  select true, consumed_at into v_exists, v_consumed
  from public.user_streak_shields
  where user_id = p_user_id
  for update;

  if v_exists and v_consumed is null then
    raise exception 'shield_already_armed';
  end if;

  select account_tier, vip_expires_at into v_account_tier, v_vip_expires_at
  from public.user_profiles
  where id = p_user_id;

  v_is_vip := public.is_vip_active(v_account_tier, v_vip_expires_at);
  v_final_cost := case when v_is_vip then round(v_aura_cost * 0.9)::integer else v_aura_cost end;

  select balance into v_balance_before
  from public.user_aura_wallet
  where user_id = p_user_id
  for update;

  update public.user_aura_wallet
  set balance = balance - v_final_cost, updated_at = now()
  where user_id = p_user_id and balance >= v_final_cost;

  if not found then
    raise exception 'insufficient_aura_balance';
  end if;

  insert into public.user_streak_shields (user_id, grace_days, source_item_slug, armed_at, consumed_at)
  values (p_user_id, v_grace, v_slug, now(), null)
  on conflict (user_id) do update set
    grace_days = excluded.grace_days,
    source_item_slug = excluded.source_item_slug,
    armed_at = now(),
    consumed_at = null;

  insert into public.aura_ledger (user_id, delta, reason)
  values (p_user_id, -v_final_cost, 'streak_shield_purchased');

  insert into public.aura_purchases (
    user_id, item_id, item_slug, item_name, item_kind,
    list_price, amount_paid, vip_discount_applied, balance_before, balance_after
  ) values (
    p_user_id, p_item_id, v_slug, v_name, 'streak_shield',
    v_aura_cost, v_final_cost, v_is_vip, v_balance_before, v_balance_before - v_final_cost
  );

  return v_grace;
end;
$$;

revoke execute on function public.purchase_streak_shield(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purchase_streak_shield(uuid, uuid) to service_role;

-- ────────────────────────────────────────────
-- 2. claim_event_medal — 10% off para VIP no branch 'aura_redeem'
--    Base: 20260816_aura_redeem_events.sql. Toda a ordem de operações é
--    preservada (medalha concedida ANTES do débito; `raise exception`
--    desfaz o insert em user_medals junto), só o valor debitado muda.
--    Eventos não gravam em `aura_purchases` — não são itens do catálogo
--    `aura_items` —, então o ledger segue sendo o único registro, agora
--    com o valor realmente cobrado.
-- ────────────────────────────────────────────
create or replace function public.claim_event_medal(p_event_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_medal_id       uuid;
  v_criteria_type  text;
  v_max            integer;
  v_count          integer;
  v_aura_cost      integer;
  v_inserted       integer;
  v_debited        integer;
  v_account_tier   text;
  v_vip_expires_at timestamptz;
  v_final_cost     integer;
begin
  select medal_id, criteria_type, max_participants, current_count, aura_cost
    into v_medal_id, v_criteria_type, v_max, v_count, v_aura_cost
  from public.events
  where id = p_event_id and active = true
  for update;

  if not found then
    return false;
  end if;

  if v_max is not null and v_count >= v_max then
    return false;
  end if;

  insert into public.user_medals (user_id, medal_id)
  values (p_user_id, v_medal_id)
  on conflict (user_id, medal_id) do nothing;

  get diagnostics v_inserted = row_count;

  -- Usuário já tinha a medalha (clique duplicado/retry): não cobra aura de
  -- novo nem soma a vaga de novo.
  if v_inserted = 0 then
    return true;
  end if;

  if v_criteria_type = 'aura_redeem' and coalesce(v_aura_cost, 0) > 0 then
    select account_tier, vip_expires_at into v_account_tier, v_vip_expires_at
    from public.user_profiles
    where id = p_user_id;

    v_final_cost := case
      when public.is_vip_active(v_account_tier, v_vip_expires_at) then round(v_aura_cost * 0.9)::integer
      else v_aura_cost
    end;

    update public.user_aura_wallet
    set balance = balance - v_final_cost, updated_at = now()
    where user_id = p_user_id and balance >= v_final_cost;

    get diagnostics v_debited = row_count;

    -- Sem linha de carteira (saldo implícito 0) ou saldo < custo: desfaz a
    -- transação inteira, inclusive o insert em user_medals acima.
    if v_debited = 0 then
      raise exception 'insufficient_aura_balance';
    end if;

    insert into public.aura_ledger (user_id, delta, reason, giver_id)
    values (p_user_id, -v_final_cost, 'event_medal_redeemed', null);
  end if;

  update public.events
  set current_count = current_count + 1,
      active = case when v_max is null then active else (current_count + 1 < v_max) end,
      end_date = case when v_max is not null and current_count + 1 >= v_max then now() else end_date end,
      updated_at = now()
  where id = p_event_id;

  return true;
end;
$$;

revoke execute on function public.claim_event_medal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_event_medal(uuid, uuid) to service_role;
