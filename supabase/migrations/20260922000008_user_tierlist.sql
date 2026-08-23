-- Tierlist PESSOAL (VIP, Beta) — diferente da tierlist EDITORIAL já
-- existente em /tierlist e /admin/tierlist (curadoria admin via
-- peripherals.tier GOAT/SS/S/A/B/C/L). Aqui é o próprio usuário montando o
-- ranking dele, exibido em /perfil/[handle]/tierlist. Nome da tabela usa
-- prefixo `user_tierlist_*` para não colidir conceitualmente com
-- `tierlist_meta`/`peripherals.tier`.
--
-- Reaproveita `peripherals` como catálogo de itens rankeáveis — mesmo
-- precedente de `user_favorite_peripherals` (user_id + peripheral_id +
-- position).
create table if not exists public.user_tierlist_items (
  user_id       uuid not null references auth.users(id) on delete cascade,
  peripheral_id uuid not null references public.peripherals(id) on delete cascade,
  tier          text not null check (tier in ('S', 'A', 'B', 'C', 'D')),
  position      smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, peripheral_id)
);

create index if not exists idx_user_tierlist_items_user
  on public.user_tierlist_items(user_id, tier, position);

alter table public.user_tierlist_items enable row level security;

-- Qualquer visitante pode ver a tierlist pública de qualquer usuário —
-- usuário comum pode visualizar, só não pode criar a própria.
drop policy if exists "Tierlist items are publicly readable" on public.user_tierlist_items;
create policy "Tierlist items are publicly readable"
  on public.user_tierlist_items for select using (true);

-- Escrita: só o dono, e só enquanto VIP ativo — reforça em SQL (defesa em
-- profundidade; a API route também valida isVipActive antes de aceitar) que
-- é feature exclusiva VIP. Rebaixar de VIP NÃO apaga a tierlist já montada
-- (mesma filosofia de selectVisibleMedals/favoritos em lib/account-tier.ts:
-- "rebaixar só esconde/congela, nunca perde dado") — sem policy de
-- insert/update pra common, o registro existente fica só de leitura até o
-- usuário reativar o VIP.
drop policy if exists "VIP users can manage their own tierlist" on public.user_tierlist_items;
create policy "VIP users can manage their own tierlist"
  on public.user_tierlist_items for all
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid() and public.is_vip_active(p.account_tier, p.vip_expires_at)
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid() and public.is_vip_active(p.account_tier, p.vip_expires_at)
    )
  );
