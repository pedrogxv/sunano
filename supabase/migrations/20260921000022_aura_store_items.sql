-- Central de Aura — loja de itens cosméticos (molduras de avatar)
-- compráveis com Aura.
--
-- Mesmo padrão de `medals`/`user_medals` (20260728000001_public_profile_showcase.sql)
-- para o catálogo + posse, e o mesmo padrão de débito atômico de
-- `claim_event_medal` (20260816_aura_redeem_events.sql) para o resgate:
-- concede a posse primeiro (insert ... on conflict do nothing = checagem
-- atômica de "já tem"), debita a Aura depois, e um `raise exception` por
-- saldo insuficiente desfaz a transação inteira, sem "desfazer" manual.
--
-- Catálogo (`aura_items`) é público como `medals` — é vitrine. Posse
-- (`user_aura_items`) só é escrita pela RPC `redeem_aura_item`
-- (security definer, só `service_role`), sem policy de insert/update direta,
-- mesmo padrão de `user_medals`.

-- ────────────────────────────────────────────
-- 1. Catálogo de itens
-- ────────────────────────────────────────────
create table if not exists public.aura_items (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  description     text,
  -- Único kind hoje é moldura de avatar; campo já existe para dar espaço a
  -- outros tipos de cosmético no futuro sem precisar de nova tabela.
  kind            text not null default 'avatar_frame'
                    check (kind in ('avatar_frame')),
  image_url       text,           -- preview do item no card da loja
  frame_asset_url text not null,  -- PNG/SVG sobreposto ao avatar quando equipado
  aura_cost       integer not null check (aura_cost > 0),
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_aura_items_active_sort
  on public.aura_items(active, sort_order);

alter table public.aura_items enable row level security;

drop policy if exists "Aura items are publicly readable" on public.aura_items;
create policy "Aura items are publicly readable"
  on public.aura_items for select using (true);

-- ────────────────────────────────────────────
-- 2. Posse por usuário
-- ────────────────────────────────────────────
create table if not exists public.user_aura_items (
  user_id     uuid not null references auth.users(id) on delete cascade,
  item_id     uuid not null references public.aura_items(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index if not exists idx_user_aura_items_user on public.user_aura_items(user_id);

alter table public.user_aura_items enable row level security;

drop policy if exists "User aura items are publicly readable" on public.user_aura_items;
create policy "User aura items are publicly readable"
  on public.user_aura_items for select using (true);

-- Escrita só via RPC `redeem_aura_item` (service-role) — sem policy de
-- insert/update, mesmo padrão de `user_medals`.

-- ────────────────────────────────────────────
-- 3. Moldura equipada no perfil
-- ────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists equipped_avatar_frame_id uuid references public.aura_items(id) on delete set null;

comment on column public.user_profiles.equipped_avatar_frame_id is
  'Item de kind=avatar_frame atualmente equipado (deve estar em user_aura_items do mesmo usuário — reforçado na aplicação, não aqui).';

-- ────────────────────────────────────────────
-- 4. Nova reason no extrato de Aura
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
    'aura_item_redeemed'
  ));

-- ────────────────────────────────────────────
-- 5. redeem_aura_item — resgata um item pagando com o saldo da wallet
-- ────────────────────────────────────────────
create or replace function public.redeem_aura_item(p_user_id uuid, p_item_id uuid)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_aura_cost integer;
  v_active    boolean;
  v_inserted  integer;
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

  update public.user_aura_wallet
  set balance = balance - v_aura_cost, updated_at = now()
  where user_id = p_user_id and balance >= v_aura_cost;

  if not found then
    raise exception 'insufficient_aura_balance';
  end if;

  insert into public.aura_ledger (user_id, delta, reason)
  values (p_user_id, -v_aura_cost, 'aura_item_redeemed');

  return true;
end;
$$;

revoke execute on function public.redeem_aura_item(uuid, uuid) from public, anon, authenticated;
grant execute on function public.redeem_aura_item(uuid, uuid) to service_role;
