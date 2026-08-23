-- Ban geral de conta — distinto de `market_banned_at` (20260830120000), que
-- restringe só o Mercado. Uma conta com `account_banned_at` preenchido:
--   * não consegue logar (checado em app/login/actions.ts, app/auth/callback,
--     e a cada request autenticada via proxy.ts/middleware-client.ts, que
--     força signOut e expulsa uma sessão já aberta);
--   * some das listagens/rankings/busca de pessoas (excludeFromPublicListings
--     em users-repository.ts) — mas o perfil público continua acessível por
--     link direto, sem 404;
--   * tem posts/comentários/reviews ocultos (is_hidden = true em massa, via
--     admin_ban_account) — mesma coluna que o próprio dono já usa para
--     ocultar conteúdo individualmente, então desbanir NÃO reexibe o que foi
--     ocultado pelo ban (perda-se a distinção de origem, aceito no design);
--   * tem o saldo de Aura zerado (user_aura_wallet.balance), preservando
--     total_earned (nunca decresce por design, alimenta conquistas
--     históricas) — o ajuste fica auditável em aura_ledger.
--
-- IMPORTANTE — aplicar manualmente via Supabase Dashboard (SQL Editor): o
-- histórico de migrations deste projeto está dessincronizado desde 04/08,
-- não rodar via `supabase db push`.

-- ────────────────────────────────────────────
-- 1. Novas colunas em user_profiles
-- ────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists account_banned_at timestamptz,
  add column if not exists account_ban_reason text;

comment on column public.user_profiles.account_banned_at is
  'Ban geral da conta (login + listagens públicas + conteúdo). Distinto de market_banned_at, que só afeta o Mercado.';

-- Índice parcial: a maioria das contas nunca é banida, então o índice fica
-- pequeno e barato — usado como predicado extra nas queries de diretório/
-- ranking já indexadas por outras colunas (profile_views, created_at, etc),
-- sem precisar de índice composto.
create index if not exists idx_user_profiles_account_banned_at
  on public.user_profiles (account_banned_at)
  where account_banned_at is not null;

-- ────────────────────────────────────────────
-- 2. Novo reason no extrato de Aura
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
    'account_banned_adjustment'
  ));

-- ────────────────────────────────────────────
-- 3. admin_ban_account — banir (idempotente, atômica)
-- ────────────────────────────────────────────
create or replace function public.admin_ban_account(p_user_id uuid, p_reason text)
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_balance integer;
begin
  -- Lock na carteira: evita corrida em duplo clique zerando o saldo duas
  -- vezes ou lançando dois ajustes no ledger para o mesmo ban.
  select balance into v_balance
  from public.user_aura_wallet
  where user_id = p_user_id
  for update;

  update public.user_profiles
  set account_banned_at = now(),
      account_ban_reason = p_reason
  where id = p_user_id;

  if not found then
    raise exception 'profile_not_found';
  end if;

  -- Zera só o saldo (nunca total_earned, que alimenta conquistas históricas
  -- e nunca decresce por design). Só lança ajuste no extrato quando havia
  -- saldo de fato — reban de uma conta já zerada não duplica a linha.
  if v_balance is not null and v_balance > 0 then
    update public.user_aura_wallet
    set balance = 0, updated_at = now()
    where user_id = p_user_id;

    insert into public.aura_ledger (user_id, delta, reason)
    values (p_user_id, -v_balance, 'account_banned_adjustment');
  end if;

  -- Oculta em massa (mesma coluna que o próprio dono usa para ocultar
  -- individualmente) — reban não reprocessa o que já está oculto.
  update public.forum_posts set is_hidden = true
    where user_id = p_user_id and is_hidden = false;
  update public.forum_comments set is_hidden = true
    where user_id = p_user_id and is_hidden = false;
  update public.blog_comments set is_hidden = true
    where user_id = p_user_id and is_hidden = false;
  update public.peripheral_reviews set is_hidden = true
    where user_id = p_user_id and is_hidden = false;
  update public.peripheral_comments set is_hidden = true
    where user_id = p_user_id and is_hidden = false;
end;
$$;

revoke execute on function public.admin_ban_account(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_ban_account(uuid, text) to service_role;

-- ────────────────────────────────────────────
-- 4. admin_unban_account — reversão
--
-- Só reabre login e listagens. NÃO restaura is_hidden (pode já ter sido
-- ocultado por outro motivo, ou pelo próprio dono antes do ban) nem devolve
-- aura (o ajuste já foi auditado como perda permanente, mesma filosofia de
-- total_earned nunca se autocorrigir magicamente).
-- ────────────────────────────────────────────
create or replace function public.admin_unban_account(p_user_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
  update public.user_profiles
  set account_banned_at = null,
      account_ban_reason = null
  where id = p_user_id;

  if not found then
    raise exception 'profile_not_found';
  end if;
end;
$$;

revoke execute on function public.admin_unban_account(uuid) from public, anon, authenticated;
grant execute on function public.admin_unban_account(uuid) to service_role;
