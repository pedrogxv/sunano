-- Central de Aura — Periféricos (produtos) passam a ter ESTOQUE.
--
-- Antes: `redeem_aura_peripheral` (20261025000000) impunha unidade única —
-- qualquer posse existente esgotava o item para todo mundo. Menos restritivo
-- agora: o item tem `stock` (default 1) e só some da loja quando o número de
-- resgates atinge o estoque. O controle de "quem resgatou" continua igual
-- (`user_aura_items` + `aura_purchases`).
--
-- Regras mantidas:
--   1. 1 por pessoa — o `primary key (user_id, item_id)` de `user_aura_items`
--      continua sendo a trava. Estoque > 1 não deixa a mesma pessoa resgatar
--      duas vezes; a checagem explícita devolve 'already_claimed'.
--   2. Trust tier `verified` (`get_giver_trust_tier`).
--   3. Sem desconto VIP.
--
-- `stock` vale só para `kind='peripheral'`. Os outros kinds ignoram a coluna
-- (cosméticos são infinitos e por-usuário).

-- ────────────────────────────────────────────
-- 1. Coluna de estoque
-- ────────────────────────────────────────────
alter table public.aura_items
  add column if not exists stock integer not null default 1
  check (stock >= 1);

comment on column public.aura_items.stock is
  'Unidades disponíveis — só usado por kind=peripheral. O item some da loja quando os resgates atingem esse número. Cosméticos ignoram.';

-- ────────────────────────────────────────────
-- 2. redeem_aura_peripheral — respeita o estoque
-- ────────────────────────────────────────────
-- Mesmo contrato de retorno: 'ok' | 'not_found' | 'already_claimed' |
-- 'not_verified'. `already_claimed` agora quer dizer "sem unidades" OU "você
-- já tem uma" (o client mostra o mesmo estado "Esgotado"/"Você já resgatou").
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

  -- 1 por pessoa: já tem uma unidade deste item.
  if exists (
    select 1 from public.user_aura_items
    where item_id = p_item_id and user_id = p_user_id
  ) then
    return 'already_claimed';
  end if;

  -- Estoque: o `for update` na linha de `aura_items` serializa as corridas,
  -- então esta contagem enxerga todos os resgates já confirmados.
  select count(*) into v_claimed
  from public.user_aura_items
  where item_id = p_item_id;

  if v_claimed >= v_stock then
    return 'already_claimed';
  end if;

  if public.get_giver_trust_tier(p_user_id) <> 'verified' then
    return 'not_verified';
  end if;

  select balance into v_balance_before
  from public.user_aura_wallet
  where user_id = p_user_id
  for update;

  update public.user_aura_wallet
  set balance = balance - v_aura_cost, updated_at = now()
  where user_id = p_user_id and balance >= v_aura_cost;

  if not found then
    raise exception 'insufficient_aura_balance';
  end if;

  insert into public.user_aura_items (user_id, item_id)
  values (p_user_id, p_item_id);

  insert into public.aura_ledger (user_id, delta, reason)
  values (p_user_id, -v_aura_cost, 'aura_peripheral_redeemed');

  insert into public.aura_purchases (
    user_id, item_id, item_slug, item_name, item_kind,
    list_price, amount_paid, vip_discount_applied, balance_before, balance_after
  ) values (
    p_user_id, p_item_id, v_slug, v_name, 'peripheral',
    v_aura_cost, v_aura_cost, false, v_balance_before, v_balance_before - v_aura_cost
  );

  return 'ok';
end;
$$;

revoke execute on function public.redeem_aura_peripheral(uuid, uuid) from public, anon, authenticated;
grant execute on function public.redeem_aura_peripheral(uuid, uuid) to service_role;
