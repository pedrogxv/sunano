-- Histórico de compras da Central de Aura — uma linha imutável por compra
-- concluída, com preço de tabela, valor pago (já com desconto VIP), e o
-- saldo da carteira ANTES e DEPOIS do débito.
--
-- Por que uma tabela nova e não derivar do `aura_ledger`:
--   • O ledger só guarda `(user_id, delta, reason)` — não diz QUAL item foi
--     comprado (o slug some no meio de várias reasons), nem o preço de
--     tabela (VIP paga 10% menos), nem o saldo em volta da transação.
--   • O admin de Itens de Aura precisa responder "quantas compras cada item
--     teve" e "quanto o fulano gastou, e com quanto ele ficou" — nada disso
--     é reconstituível do ledger sem replay frágil.
--
-- Padrão de escrita: a linha é inserida DENTRO da mesma transação
-- `security definer` que debita a carteira, logo após capturar
-- `balance_before`. Um `raise exception` por saldo insuficiente desfaz a
-- compra inteira, incluindo esta linha — mesmo princípio de `redeem_aura_item`.
--
-- `item_name`/`item_slug`/`item_kind` são SNAPSHOT: deletar ou renomear um
-- item da loja não apaga nem falseia o histórico de receita dele. `item_id`
-- é FK `on delete set null` só para permitir "pular para o item" quando ele
-- ainda existe.

-- ────────────────────────────────────────────
-- 1. Tabela
-- ────────────────────────────────────────────
create table if not exists public.aura_purchases (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  item_id              uuid references public.aura_items(id) on delete set null,
  item_slug            text not null,
  item_name            text not null,
  item_kind            text not null,
  -- Preço do catálogo no momento da compra.
  list_price           integer not null check (list_price >= 0),
  -- O que de fato saiu da carteira (list_price, ou round(list_price*0.9) p/ VIP).
  amount_paid          integer not null check (amount_paid >= 0),
  vip_discount_applied boolean not null default false,
  -- Saldo em volta do débito. NULL só para linhas retroativas (backfill do
  -- ledger, onde o saldo histórico é desconhecido) — compras novas sempre
  -- preenchem os dois.
  balance_before       integer,
  balance_after        integer,
  created_at           timestamptz not null default now()
);

create index if not exists idx_aura_purchases_item on public.aura_purchases (item_id, created_at desc);
create index if not exists idx_aura_purchases_user on public.aura_purchases (user_id, created_at desc);
create index if not exists idx_aura_purchases_created on public.aura_purchases (created_at desc, id desc);
create index if not exists idx_aura_purchases_kind on public.aura_purchases (item_kind, created_at desc);

alter table public.aura_purchases enable row level security;

-- SEM policy de select pública: ao contrário de `aura_items`/`user_aura_items`
-- (vitrine), o histórico de gastos de cada usuário só é lido pelo endpoint
-- admin (service-role). Escrita idem — só as RPCs `security definer`.

-- ────────────────────────────────────────────
-- 2. redeem_aura_item — grava a compra da moldura/streak-shield-antigo
-- ────────────────────────────────────────────
create or replace function public.redeem_aura_item(p_user_id uuid, p_item_id uuid)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_aura_cost      integer;
  v_active         boolean;
  v_slug           text;
  v_name           text;
  v_kind           text;
  v_inserted       integer;
  v_account_tier   text;
  v_vip_expires_at timestamptz;
  v_is_vip         boolean;
  v_final_cost     integer;
  v_balance_before integer;
begin
  select aura_cost, active, slug, name, kind
    into v_aura_cost, v_active, v_slug, v_name, v_kind
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

  insert into public.aura_ledger (user_id, delta, reason)
  values (p_user_id, -v_final_cost, 'aura_item_redeemed');

  insert into public.aura_purchases (
    user_id, item_id, item_slug, item_name, item_kind,
    list_price, amount_paid, vip_discount_applied, balance_before, balance_after
  ) values (
    p_user_id, p_item_id, v_slug, v_name, v_kind,
    v_aura_cost, v_final_cost, v_is_vip, v_balance_before, v_balance_before - v_final_cost
  );

  return true;
end;
$$;

revoke execute on function public.redeem_aura_item(uuid, uuid) from public, anon, authenticated;
grant execute on function public.redeem_aura_item(uuid, uuid) to service_role;

-- ────────────────────────────────────────────
-- 3. purchase_vip_with_aura — grava a compra do VIP
-- ────────────────────────────────────────────
create or replace function public.purchase_vip_with_aura(p_user_id uuid)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_item_id        uuid;
  v_aura_cost      integer;
  v_active         boolean;
  v_name           text;
  v_account_tier   text;
  v_vip_expires_at timestamptz;
  v_balance_before integer;
begin
  select id, aura_cost, active, name
    into v_item_id, v_aura_cost, v_active, v_name
  from public.aura_items
  where slug = 'vip-1-mes'
  for update;

  if not found or not v_active then
    raise exception 'item_unavailable';
  end if;

  select account_tier, vip_expires_at into v_account_tier, v_vip_expires_at
  from public.user_profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  if v_account_tier = 'vip' and (v_vip_expires_at is null or v_vip_expires_at > now()) then
    raise exception 'vip_already_active';
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

  update public.user_profiles
  set account_tier = 'vip',
      vip_expires_at = greatest(now(), coalesce(vip_expires_at, now())) + interval '1 month'
  where id = p_user_id;

  insert into public.aura_ledger (user_id, delta, reason)
  values (p_user_id, -v_aura_cost, 'vip_purchased');

  insert into public.aura_purchases (
    user_id, item_id, item_slug, item_name, item_kind,
    list_price, amount_paid, vip_discount_applied, balance_before, balance_after
  ) values (
    p_user_id, v_item_id, 'vip-1-mes', v_name, 'vip_month',
    v_aura_cost, v_aura_cost, false, v_balance_before, v_balance_before - v_aura_cost
  );

  return true;
end;
$$;

revoke execute on function public.purchase_vip_with_aura(uuid) from public, anon, authenticated;
grant execute on function public.purchase_vip_with_aura(uuid) to service_role;

-- ────────────────────────────────────────────
-- 4. change_display_name_with_aura — grava a compra da troca de nome
-- ────────────────────────────────────────────
create or replace function public.change_display_name_with_aura(p_user_id uuid, p_new_name text)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_item_id                 uuid;
  v_aura_cost               integer;
  v_active                  boolean;
  v_name                    text;
  v_display_name_changed_at timestamptz;
  v_account_tier            text;
  v_vip_expires_at          timestamptz;
  v_is_vip                  boolean;
  v_final_cost              integer;
  v_balance_before          integer;
begin
  select id, aura_cost, active, name
    into v_item_id, v_aura_cost, v_active, v_name
  from public.aura_items
  where slug = 'trocar-nome'
  for update;

  if not found or not v_active then
    raise exception 'item_unavailable';
  end if;

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

  update public.user_profiles
  set display_name = p_new_name,
      display_name_changed_at = now()
  where id = p_user_id;

  insert into public.aura_ledger (user_id, delta, reason)
  values (p_user_id, -v_final_cost, 'display_name_changed');

  insert into public.aura_purchases (
    user_id, item_id, item_slug, item_name, item_kind,
    list_price, amount_paid, vip_discount_applied, balance_before, balance_after
  ) values (
    p_user_id, v_item_id, 'trocar-nome', v_name, 'display_name_change',
    v_aura_cost, v_final_cost, v_is_vip, v_balance_before, v_balance_before - v_final_cost
  );

  return true;
end;
$$;

revoke execute on function public.change_display_name_with_aura(uuid, text) from public, anon, authenticated;
grant execute on function public.change_display_name_with_aura(uuid, text) to service_role;

-- ────────────────────────────────────────────
-- 5. purchase_streak_shield — grava a compra do escudo
-- ────────────────────────────────────────────
drop function if exists public.purchase_streak_shield(uuid, uuid);

create function public.purchase_streak_shield(p_user_id uuid, p_item_id uuid)
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

  insert into public.user_streak_shields (user_id, grace_days, source_item_slug, armed_at, consumed_at)
  values (p_user_id, v_grace, v_slug, now(), null)
  on conflict (user_id) do update set
    grace_days = excluded.grace_days,
    source_item_slug = excluded.source_item_slug,
    armed_at = now(),
    consumed_at = null;

  insert into public.aura_ledger (user_id, delta, reason)
  values (p_user_id, -v_aura_cost, 'streak_shield_purchased');

  insert into public.aura_purchases (
    user_id, item_id, item_slug, item_name, item_kind,
    list_price, amount_paid, vip_discount_applied, balance_before, balance_after
  ) values (
    p_user_id, p_item_id, v_slug, v_name, 'streak_shield',
    v_aura_cost, v_aura_cost, false, v_balance_before, v_balance_before - v_aura_cost
  );

  return v_grace;
end;
$$;

revoke execute on function public.purchase_streak_shield(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purchase_streak_shield(uuid, uuid) to service_role;

-- ────────────────────────────────────────────
-- 6. Backfill retroativo do `aura_ledger`
--    Melhor esforço: item/valor/data vêm do ledger; saldo em volta é
--    desconhecido historicamente (fica NULL, a UI mostra "—").
--    `amount_paid = -delta`. `list_price` = custo atual do catálogo quando
--    dá para casar o slug; senão, = amount_paid (assume sem desconto).
-- ────────────────────────────────────────────
insert into public.aura_purchases (
  user_id, item_id, item_slug, item_name, item_kind,
  list_price, amount_paid, vip_discount_applied, balance_before, balance_after, created_at
)
select
  l.user_id,
  frame.item_id,
  coalesce(frame_item.slug, ai.slug, m.fallback_slug),
  coalesce(frame_item.name, ai.name, m.fallback_name),
  coalesce(frame_item.kind, ai.kind, m.fallback_kind),
  coalesce(frame_item.aura_cost, ai.aura_cost, -l.delta),
  -l.delta,
  false,
  null,
  null,
  l.created_at
from public.aura_ledger l
cross join lateral (
  select
    case l.reason
      when 'aura_item_redeemed'      then 'item-removido'
      when 'vip_purchased'           then 'vip-1-mes'
      when 'display_name_changed'    then 'trocar-nome'
      when 'streak_shield_purchased' then 'protecao-ofensiva'
    end as fallback_slug,
    case l.reason
      when 'aura_item_redeemed'      then 'Item de Aura'
      when 'vip_purchased'           then 'VIP por 1 mês'
      when 'display_name_changed'    then 'Trocar nome de exibição'
      when 'streak_shield_purchased' then 'Proteção de Ofensiva'
    end as fallback_name,
    case l.reason
      when 'aura_item_redeemed'      then 'avatar_frame'
      when 'vip_purchased'           then 'vip_month'
      when 'display_name_changed'    then 'display_name_change'
      when 'streak_shield_purchased' then 'streak_shield'
    end as fallback_kind
) m
-- Para molduras, tenta recuperar o item exato: `user_aura_items.acquired_at`
-- é gravado na mesma transação que a linha do ledger, então casa por janela
-- curta + usuário. Se o usuário resgatou 2 molduras no mesmo segundo (raro),
-- pega a primeira — melhor esforço, sem travar o backfill.
left join lateral (
  select uai.item_id
  from public.user_aura_items uai
  where l.reason = 'aura_item_redeemed'
    and uai.user_id = l.user_id
    and uai.acquired_at between l.created_at - interval '5 seconds'
                           and l.created_at + interval '5 seconds'
  order by abs(extract(epoch from (uai.acquired_at - l.created_at)))
  limit 1
) frame on true
left join public.aura_items frame_item on frame_item.id = frame.item_id
left join public.aura_items ai
  on ai.slug = case l.reason
       when 'vip_purchased'        then 'vip-1-mes'
       when 'display_name_changed' then 'trocar-nome'
       else null
     end
where l.reason in ('aura_item_redeemed', 'vip_purchased', 'display_name_changed', 'streak_shield_purchased')
  and l.delta < 0
  and not exists (
    select 1 from public.aura_purchases p
    where p.user_id = l.user_id and p.created_at = l.created_at
  );
