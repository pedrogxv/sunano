-- Produtos físicos (kind='peripheral') passam a ter o desconto VIP de 10%,
-- igual ao resto da Central de Aura (molduras, troca de nome — ver
-- 20260922000007). A decisão do preço continua DENTRO da RPC: o client só
-- exibe uma prévia a partir do status VIP já resolvido no server.
--
-- `aura_purchases` grava o recorte real: `list_price` = preço de tabela,
-- `amount_paid` = o que saiu da carteira, `vip_discount_applied` = true quando
-- o abatimento entrou. `aura_ledger.delta` = -amount_paid.
--
-- Contrato de retorno inalterado: 'ok' | 'not_found' | 'already_claimed' |
-- 'not_verified'; saldo insuficiente segue como `raise 'insufficient_aura_balance'`.

create or replace function public.redeem_aura_peripheral(p_user_id uuid, p_item_id uuid)
returns text language plpgsql security definer
set search_path = public as $$
declare
  v_aura_cost      integer;
  v_active         boolean;
  v_kind           text;
  v_slug           text;
  v_name           text;
  v_stock          integer;
  v_claimed        integer;
  v_account_tier   text;
  v_vip_expires_at timestamptz;
  v_is_vip         boolean;
  v_final_cost     integer;
  v_balance_before integer;
begin
  select aura_cost, active, kind, slug, name, stock
    into v_aura_cost, v_active, v_kind, v_slug, v_name, v_stock
  from public.aura_items
  where id = p_item_id
  for update;

  if not found or not v_active or v_kind <> 'peripheral' then
    return 'not_found';
  end if;

  -- 1 por pessoa.
  if exists (
    select 1 from public.user_aura_items
    where item_id = p_item_id and user_id = p_user_id
  ) then
    return 'already_claimed';
  end if;

  -- Estoque (o `for update` acima serializa as corridas).
  select count(*) into v_claimed
  from public.user_aura_items
  where item_id = p_item_id;

  if v_claimed >= v_stock then
    return 'already_claimed';
  end if;

  if public.get_giver_trust_tier(p_user_id) <> 'verified' then
    return 'not_verified';
  end if;

  select account_tier, vip_expires_at into v_account_tier, v_vip_expires_at
  from public.user_profiles
  where id = p_user_id;

  v_is_vip := public.is_vip_active(v_account_tier, v_vip_expires_at);
  v_final_cost := case
    when v_is_vip then round(v_aura_cost * 0.9)::integer
    else v_aura_cost
  end;

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

  insert into public.user_aura_items (user_id, item_id)
  values (p_user_id, p_item_id);

  insert into public.aura_ledger (user_id, delta, reason)
  values (p_user_id, -v_final_cost, 'aura_peripheral_redeemed');

  insert into public.aura_purchases (
    user_id, item_id, item_slug, item_name, item_kind,
    list_price, amount_paid, vip_discount_applied, balance_before, balance_after
  ) values (
    p_user_id, p_item_id, v_slug, v_name, 'peripheral',
    v_aura_cost, v_final_cost, v_is_vip, v_balance_before, v_balance_before - v_final_cost
  );

  return 'ok';
end;
$$;

revoke execute on function public.redeem_aura_peripheral(uuid, uuid) from public, anon, authenticated;
grant execute on function public.redeem_aura_peripheral(uuid, uuid) to service_role;
