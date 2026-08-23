-- Conquista especial "Inscrito" (binária, single-level, sem tiers) — concedida
-- ao confirmar inscrição no canal do YouTube via OAuth do Google
-- (subscriptions.list, ver app/auth/youtube/callback/route.ts). Reaproveita a
-- carteira de Aura já existente (user_aura_wallet/aura_ledger, ver
-- 20260806_forum_aura.sql) — nenhuma moeda nova.
--
-- Não entra em `achievements` (essa tabela é rigidamente uma progressão de 5
-- tiers com cor fixa por tier, compartilhada por posts/comments/followers/
-- aura_earned — ver 20260808_achievements_streak.sql) nem em `medals` (exige
-- catálogo e concessão manual/por evento). Tabela própria, mais simples: é
-- uma conquista única, não uma família.

create table if not exists public.user_youtube_subscription (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  confirmed_at timestamptz not null default now()
);

alter table public.user_youtube_subscription enable row level security;

-- Pública: aparece na vitrine de perfil como qualquer outra conquista/medalha.
drop policy if exists "Youtube subscription is publicly readable" on public.user_youtube_subscription;
create policy "Youtube subscription is publicly readable"
  on public.user_youtube_subscription for select using (true);

-- Sem policy de insert/update: só concedida via `confirm_youtube_subscription`
-- (service-role), mesma postura de `user_medals`/`user_achievements`.

-- ────────────────────────────────────────────
-- Novo motivo no extrato de aura (mesmo padrão de redefinir o CHECK inteiro a
-- cada migration que adiciona motivo — lista completa vigente copiada de
-- 20260921000022_aura_store_items.sql + o motivo novo deste arquivo).
-- ────────────────────────────────────────────
alter table public.aura_ledger
  drop constraint if exists aura_ledger_reason_check,
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
    'youtube_subscription_confirmed'
  ));

-- ────────────────────────────────────────────
-- confirm_youtube_subscription — concede a conquista + credita 50 de Aura,
-- numa chamada só. Idempotente: `insert ... on conflict do nothing` +
-- checar `found` evita duplicar a recompensa em cliques/corridas duplas
-- (mesmo truque de `redeem_aura_item`, ver 20260921000022_aura_store_items.sql).
-- ────────────────────────────────────────────
create or replace function public.confirm_youtube_subscription(p_user_id uuid)
returns boolean -- true se concedeu agora, false se já tinha sido concedida antes
language plpgsql security definer
set search_path = public as $$
begin
  insert into public.user_youtube_subscription (user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  if not found then
    return false;
  end if;

  insert into public.user_aura_wallet (user_id, balance) values (p_user_id, 50)
    on conflict (user_id) do update
      set balance = user_aura_wallet.balance + 50, updated_at = now();

  insert into public.aura_ledger (user_id, delta, reason)
    values (p_user_id, 50, 'youtube_subscription_confirmed');

  return true;
end;
$$;

revoke execute on function public.confirm_youtube_subscription(uuid) from public, anon, authenticated;
grant execute on function public.confirm_youtube_subscription(uuid) to service_role;
