-- Duas novas compras da Central de Aura: 1 mês de VIP (500 Aura) e troca de
-- nome de exibição (100 Aura, cooldown de 3 dias). Mesmo padrão de
-- `redeem_aura_item` (20260921000022_aura_store_items.sql): atomicidade
-- inteira numa função `security definer` com lock via `select ... for
-- update` — é dinheiro (Aura) envolvido, nunca confiar só no client.
--
-- As duas entram no catálogo `aura_items` como novos `kind`, reaproveitando
-- a mesma tabela/UI de loja em vez de estruturas paralelas — só o botão de
-- ação no card muda de comportamento conforme o `kind` (ver
-- AuraCenterContent.tsx no frontend).

-- ────────────────────────────────────────────
-- 1. Novas colunas em user_profiles
-- ────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists vip_expires_at timestamptz null;

comment on column public.user_profiles.vip_expires_at is
  'Validade do VIP comprado com Aura. NULL = sem expiração (VIP concedido manualmente pelo admin, ou nunca comprado). VIP "ativo" = account_tier = ''vip'' AND (vip_expires_at IS NULL OR vip_expires_at > now()). O endpoint admin (/api/admin/users) nunca toca esta coluna — um VIP manual permanece permanente mesmo que o usuário já tenha comprado VIP com Aura antes.';

alter table public.user_profiles
  add column if not exists display_name_changed_at timestamptz null;

comment on column public.user_profiles.display_name_changed_at is
  'Timestamp da última troca de nome paga com Aura (change_display_name_with_aura). NULL = nunca trocou por essa via. Cooldown de 3 dias calculado na leitura (now() - display_name_changed_at >= interval ''3 days''), mesmo padrão de isStreakActive em achievements-repository.ts — sem tabela de histórico separada.';

-- ────────────────────────────────────────────
-- 2. Novos kinds em aura_items
-- ────────────────────────────────────────────
alter table public.aura_items
  drop constraint if exists aura_items_kind_check;
alter table public.aura_items
  add constraint aura_items_kind_check check (kind in (
    'avatar_frame', 'vip_month', 'display_name_change'
  ));

-- ────────────────────────────────────────────
-- 3. Novas reasons no extrato de Aura
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
    'display_name_changed'
  ));

-- ────────────────────────────────────────────
-- 4. Seed dos dois novos itens no catálogo
-- ────────────────────────────────────────────
insert into public.aura_items (slug, name, description, kind, image_url, frame_asset_url, aura_cost, active, sort_order)
values
  (
    'vip-1-mes',
    'VIP por 1 mês',
    'Ative o VIP por 30 dias: mídia animada, mais medalhas e favoritos em destaque no seu perfil.',
    'vip_month',
    null,
    -- `frame_asset_url` é `not null` na tabela mas só faz sentido para
    -- kind=avatar_frame; string vazia aqui só satisfaz a coluna — o
    -- frontend nunca lê este campo para kind != 'avatar_frame'.
    '',
    500,
    true,
    -1
  ),
  (
    'trocar-nome',
    'Trocar nome de exibição',
    'Escolha um novo nome de exibição para o seu perfil. Cooldown de 3 dias entre trocas.',
    'display_name_change',
    null,
    '',
    100,
    true,
    -2
  )
on conflict (slug) do nothing;

-- ────────────────────────────────────────────
-- 5. purchase_vip_with_aura — compra 1 mês de VIP pagando com Aura
-- ────────────────────────────────────────────
create or replace function public.purchase_vip_with_aura(p_user_id uuid)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_aura_cost      integer;
  v_active         boolean;
  v_account_tier   text;
  v_vip_expires_at timestamptz;
begin
  select aura_cost, active into v_aura_cost, v_active
  from public.aura_items
  where slug = 'vip-1-mes'
  for update;

  if not found or not v_active then
    raise exception 'item_unavailable';
  end if;

  -- Lock na linha do perfil: barra duplo-clique/corrida comprando 2x antes
  -- do primeiro commit, e garante que a checagem "já é VIP?" é atômica com
  -- o débito, não só uma checagem otimista do client.
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

  update public.user_aura_wallet
  set balance = balance - v_aura_cost, updated_at = now()
  where user_id = p_user_id and balance >= v_aura_cost;

  if not found then
    raise exception 'insufficient_aura_balance';
  end if;

  -- `greatest(now(), vip_expires_at)` é resiliente a uma futura mudança de
  -- regra que permita renovar antes de expirar (hoje a checagem acima já
  -- impede chegar aqui com VIP ativo).
  update public.user_profiles
  set account_tier = 'vip',
      vip_expires_at = greatest(now(), coalesce(vip_expires_at, now())) + interval '1 month'
  where id = p_user_id;

  insert into public.aura_ledger (user_id, delta, reason)
  values (p_user_id, -v_aura_cost, 'vip_purchased');

  return true;
end;
$$;

revoke execute on function public.purchase_vip_with_aura(uuid) from public, anon, authenticated;
grant execute on function public.purchase_vip_with_aura(uuid) to service_role;

-- ────────────────────────────────────────────
-- 6. change_display_name_with_aura — troca de nome pagando com Aura
--
-- Recebe só o nome novo (não o slug): `display_slug` é mantido por trigger
-- (`sync_display_slug`, ver 20260729000002_unique_display_name.sql), que
-- roda automaticamente no UPDATE abaixo e já resolve a unicidade real via
-- `user_profiles_display_slug_key` — sem duplicar a lógica de slugify aqui.
-- Formato/reserva/filtro de conteúdo são validados em TypeScript ANTES de
-- chamar esta RPC (validateDisplayName + isDisplayNameAvailable), igual ao
-- padrão que o POST /api/profile já seguia; esta função garante só a parte
-- que precisa ser atômica: cooldown + débito + gravação do nome.
-- ────────────────────────────────────────────
create or replace function public.change_display_name_with_aura(p_user_id uuid, p_new_name text)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_aura_cost               integer;
  v_active                  boolean;
  v_display_name_changed_at timestamptz;
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
  select display_name_changed_at into v_display_name_changed_at
  from public.user_profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  if v_display_name_changed_at is not null and v_display_name_changed_at > now() - interval '3 days' then
    raise exception 'name_change_on_cooldown';
  end if;

  update public.user_aura_wallet
  set balance = balance - v_aura_cost, updated_at = now()
  where user_id = p_user_id and balance >= v_aura_cost;

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
  values (p_user_id, -v_aura_cost, 'display_name_changed');

  return true;
end;
$$;

revoke execute on function public.change_display_name_with_aura(uuid, text) from public, anon, authenticated;
grant execute on function public.change_display_name_with_aura(uuid, text) to service_role;
