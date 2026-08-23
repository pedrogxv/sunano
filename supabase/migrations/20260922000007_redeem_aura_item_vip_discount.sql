-- Aplica 10% de desconto no custo em Aura para VIP em toda a Central de
-- Aura: molduras de avatar (redeem_aura_item) e troca de nome
-- (change_display_name_with_aura). O desconto é decidido e aplicado DENTRO
-- da RPC, nunca em TypeScript — o client nunca decide o preço, só exibe uma
-- prévia calculada a partir do status VIP já resolvido no server.
--
-- Deliberadamente NÃO altera purchase_vip_with_aura: essa RPC já bloqueia
-- quem já é VIP ativo (vip_already_active), então nunca have­ria um VIP
-- ativo comprando o item 'vip-1-mes' — o desconto ali nunca se aplicaria na
-- prática.

create or replace function public.redeem_aura_item(p_user_id uuid, p_item_id uuid)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_aura_cost      integer;
  v_active         boolean;
  v_inserted       integer;
  v_account_tier   text;
  v_vip_expires_at timestamptz;
  v_final_cost     integer;
begin
  select aura_cost, active into v_aura_cost, v_active
  from public.aura_items
  where id = p_item_id
  for update;

  if not found or not v_active then
    return false;
  end if;

  insert into public.user_aura_items (user_id, item_id)
  values (p_user_id, p_item_id)
  on conflict (user_id, item_id) do nothing;

  get diagnostics v_inserted = row_count;

  -- Já possuía o item (clique duplicado/retry): não cobra de novo.
  if v_inserted = 0 then
    return true;
  end if;

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

  if not found then
    raise exception 'insufficient_aura_balance';
  end if;

  insert into public.aura_ledger (user_id, delta, reason)
  values (p_user_id, -v_final_cost, 'aura_item_redeemed');

  return true;
end;
$$;

revoke execute on function public.redeem_aura_item(uuid, uuid) from public, anon, authenticated;
grant execute on function public.redeem_aura_item(uuid, uuid) to service_role;

-- ────────────────────────────────────────────

create or replace function public.change_display_name_with_aura(p_user_id uuid, p_new_name text)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_aura_cost               integer;
  v_active                  boolean;
  v_display_name_changed_at timestamptz;
  v_account_tier            text;
  v_vip_expires_at          timestamptz;
  v_final_cost              integer;
begin
  select aura_cost, active into v_aura_cost, v_active
  from public.aura_items
  where slug = 'trocar-nome'
  for update;

  if not found or not v_active then
    raise exception 'item_unavailable';
  end if;

  -- Lock na linha do perfil: cooldown + débito + gravação do nome viram uma
  -- única seção crítica — sem isso, dois cliques rápidos poderiam ambos
  -- passar pela checagem de cooldown antes de qualquer um debitar.
  select display_name_changed_at, account_tier, vip_expires_at
    into v_display_name_changed_at, v_account_tier, v_vip_expires_at
  from public.user_profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  if v_display_name_changed_at is not null and v_display_name_changed_at > now() - interval '3 days' then
    raise exception 'name_change_on_cooldown';
  end if;

  v_final_cost := case
    when public.is_vip_active(v_account_tier, v_vip_expires_at) then round(v_aura_cost * 0.9)::integer
    else v_aura_cost
  end;

  update public.user_aura_wallet
  set balance = balance - v_final_cost, updated_at = now()
  where user_id = p_user_id and balance >= v_final_cost;

  if not found then
    raise exception 'insufficient_aura_balance';
  end if;

  -- Dispara sync_display_slug (recalcula display_slug) e o índice único
  -- user_profiles_display_slug_key barra colisão real de slug entre dois
  -- usuários trocando para o mesmo nome ao mesmo tempo — a checagem de
  -- disponibilidade em TS (isDisplayNameAvailable) é só conveniência de UI,
  -- esta constraint é a garantia final.
  update public.user_profiles
  set display_name = p_new_name,
      display_name_changed_at = now()
  where id = p_user_id;

  insert into public.aura_ledger (user_id, delta, reason)
  values (p_user_id, -v_final_cost, 'display_name_changed');

  return true;
end;
$$;

revoke execute on function public.change_display_name_with_aura(uuid, text) from public, anon, authenticated;
grant execute on function public.change_display_name_with_aura(uuid, text) to service_role;
