-- Central de Aura — Periféricos como prêmio resgatável com Aura.
--
-- Diferente de todo o resto da loja (`aura_items`): itens cosméticos são
-- infinitos e por-usuário; um periférico é UNIDADE ÚNICA — depois que alguém
-- resgata, ninguém mais consegue. Duas regras novas, ambas impostas dentro da
-- RPC `redeem_aura_peripheral` (nunca no client):
--
--   1. Unidade única: a trava é `exists (... user_aura_items where item_id = X)`
--      — SEM `user_id`. O `for update` na linha de `aura_items` serializa duas
--      compras concorrentes: a 2ª bloqueia, e quando destrava já enxerga a
--      posse da 1ª e devolve 'already_claimed'. O `primary key (user_id,
--      item_id)` de `user_aura_items` é a rede final.
--   2. Trust tier: só quem é `get_giver_trust_tier = 'verified'`
--      (20261024000000) resgata. Não-verificado recebe 'not_verified' — o
--      client mostra a seção mas trava o botão.
--
-- SEM desconto VIP: é produto físico, o abatimento de 10% da Central de Aura
-- (20260922000007) não faz sentido aqui. `vip_discount_applied` sempre false.
--
-- `redeem_aura_item` (kinds cosméticos) NÃO muda. Esta migration só ADICIONA:
-- o kind 'peripheral', a RPC nova, e a reason nova no ledger.

-- ────────────────────────────────────────────
-- 1. Novo kind + frame_asset_url passa a ser opcional
-- ────────────────────────────────────────────
alter table public.aura_items
  drop constraint if exists aura_items_kind_check;
alter table public.aura_items
  add constraint aura_items_kind_check check (kind in (
    'avatar_frame',
    'vip_month',
    'display_name_change',
    'streak_shield',
    'mini_profile_bg',
    'peripheral'
  ));

-- Periférico não tem asset sobreposto ao avatar — a foto do produto vai em
-- `image_url`. Cosméticos continuam preenchendo `frame_asset_url` normalmente.
alter table public.aura_items
  alter column frame_asset_url drop not null;

-- ────────────────────────────────────────────
-- 2. Nova reason no extrato de Aura
-- ────────────────────────────────────────────
alter table public.aura_ledger
  drop constraint if exists aura_ledger_reason_check;
alter table public.aura_ledger
  add constraint aura_ledger_reason_check check (reason in (
    'post_aura_received', 'post_aura_removed',
    'comment_aura_received', 'comment_aura_removed',
    'event_medal_redeemed',
    'blog_post_aura_received', 'blog_post_aura_removed',
    'blog_comment_aura_received', 'blog_comment_aura_removed',
    'post_aura_disliked', 'post_aura_undisliked',
    'comment_aura_disliked', 'comment_aura_undisliked',
    'blog_post_aura_disliked', 'blog_post_aura_undisliked',
    'blog_comment_aura_disliked', 'blog_comment_aura_undisliked',
    'post_created', 'comment_created', 'blog_comment_created',
    'daily_mission_completed', 'daily_streak_bonus', 'achievement_unlocked',
    'peripheral_comment_aura_received', 'peripheral_comment_aura_removed',
    'peripheral_comment_aura_disliked', 'peripheral_comment_aura_undisliked',
    'peripheral_comment_created',
    'peripheral_review_created',
    'aura_item_redeemed',
    'youtube_subscription_confirmed',
    'vip_purchased',
    'display_name_changed',
    'account_banned_adjustment',
    'streak_shield_purchased',
    'discord_membership_confirmed',
    'referral_signup',
    'referral_indirect',
    'aura_peripheral_redeemed'
  ));

-- ────────────────────────────────────────────
-- 3. redeem_aura_peripheral — resgata a unidade única pagando com Aura
-- ────────────────────────────────────────────
-- Retorna um CÓDIGO (não boolean): o client precisa distinguir "esgotado" de
-- "sem nível". Códigos: 'ok', 'not_found', 'already_claimed', 'not_verified'.
-- Saldo insuficiente continua sendo `raise exception 'insufficient_aura_balance'`
-- (desfaz a transação inteira), mesmo contrato de `redeem_aura_item`.
create or replace function public.redeem_aura_peripheral(p_user_id uuid, p_item_id uuid)
returns text language plpgsql security definer
set search_path = public as $$
declare
  v_aura_cost      integer;
  v_active         boolean;
  v_kind           text;
  v_slug           text;
  v_name           text;
  v_balance_before integer;
begin
  select aura_cost, active, kind, slug, name
    into v_aura_cost, v_active, v_kind, v_slug, v_name
  from public.aura_items
  where id = p_item_id
  for update;

  if not found or not v_active or v_kind <> 'peripheral' then
    return 'not_found';
  end if;

  -- Unidade única: qualquer posse já existente para este item (independente
  -- de quem) esgota. O `for update` acima serializa as corridas.
  if exists (select 1 from public.user_aura_items where item_id = p_item_id) then
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
