-- Conquista especial "No Discord" (binária, single-level, sem tiers) —
-- concedida ao confirmar, via OAuth do Discord (escopo `guilds`), que o
-- usuário É MEMBRO do servidor oficial. Ver app/auth/discord/callback/route.ts.
--
-- Espelha `user_youtube_subscription`
-- (20260921120000_youtube_subscription_achievement.sql) de propósito: mesma
-- forma de conquista (única, não uma família), mesma carteira de Aura
-- (user_aura_wallet/aura_ledger, ver 20260806_forum_aura.sql) — nenhuma moeda
-- nova, nenhuma tabela de progressão nova.
--
-- Guarda também `discord_user_id`: é o snowflake da conta Discord que passou
-- na verificação. Serve para auditoria ("quem é essa pessoa lá no servidor")
-- e impede que DUAS contas do site reivindiquem a MESMA conta Discord para
-- ganhar 50 de Aura cada — daí o `unique`.

create table if not exists public.user_discord_membership (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  discord_user_id text not null unique,
  confirmed_at    timestamptz not null default now()
);

alter table public.user_discord_membership enable row level security;

-- Pública: aparece na vitrine de perfil como qualquer outra conquista/medalha.
-- Só o `user_id` interessa ao público; `discord_user_id` é dado de conta de
-- terceiro e não deve vazar para o navegador de estranhos — por isso toda
-- leitura do site passa pelo repositório (service role), que seleciona
-- apenas as colunas necessárias. A policy abaixo existe para o mesmo caso do
-- YouTube (vitrine pública), não para leitura direta do cliente.
drop policy if exists "Discord membership is publicly readable" on public.user_discord_membership;
create policy "Discord membership is publicly readable"
  on public.user_discord_membership for select using (true);

-- Sem policy de insert/update: só concedida via `confirm_discord_membership`
-- (service-role), mesma postura de `user_youtube_subscription`/`user_medals`.

-- ────────────────────────────────────────────
-- Novo motivo no extrato de aura (mesmo padrão de redefinir o CHECK inteiro a
-- cada migration que adiciona motivo — lista completa vigente copiada de
-- 20261005000000_aura_streak_shield_inventory.sql + o motivo novo deste arquivo).
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
    'discord_membership_confirmed'
  ));

-- ────────────────────────────────────────────
-- confirm_discord_membership — concede a conquista + credita 50 de Aura numa
-- chamada só. Idempotente: `insert ... on conflict do nothing` + checar
-- `found` evita duplicar a recompensa em cliques/corridas duplas (mesmo
-- truque de `confirm_youtube_subscription`).
--
-- Retorna um código de texto em vez de boolean porque aqui há DOIS motivos
-- distintos para não creditar, e o front precisa dizer coisas diferentes:
--   'granted'        — concedeu agora (+50 de Aura)
--   'already'        — este usuário já tinha a conquista
--   'account_in_use' — outra conta do site já usou ESTA conta do Discord
-- ────────────────────────────────────────────
create or replace function public.confirm_discord_membership(
  p_user_id uuid,
  p_discord_user_id text
)
returns text
language plpgsql security definer
set search_path = public as $$
declare
  v_owner uuid;
begin
  insert into public.user_discord_membership (user_id, discord_user_id)
    values (p_user_id, p_discord_user_id)
    on conflict do nothing;

  if not found then
    -- Colidiu em uma das duas unique constraints. Descobrir qual: se a conta
    -- do Discord já está registrada para OUTRO usuário, é reuso de conta.
    select user_id into v_owner
      from public.user_discord_membership
      where discord_user_id = p_discord_user_id;

    if v_owner is not null and v_owner <> p_user_id then
      return 'account_in_use';
    end if;

    return 'already';
  end if;

  insert into public.user_aura_wallet (user_id, balance) values (p_user_id, 50)
    on conflict (user_id) do update
      set balance = user_aura_wallet.balance + 50, updated_at = now();

  insert into public.aura_ledger (user_id, delta, reason)
    values (p_user_id, 50, 'discord_membership_confirmed');

  return 'granted';
end;
$$;

revoke execute on function public.confirm_discord_membership(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_discord_membership(uuid, text) to service_role;
