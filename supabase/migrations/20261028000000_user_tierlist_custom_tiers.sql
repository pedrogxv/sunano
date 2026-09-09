-- Tiers da tierlist pessoal deixam de ser fixos (S/A/B/C/D) e viram registro
-- do próprio usuário: nome e cor editáveis, entre 2 e 6 por pessoa. Esta
-- tabela guarda a definição; `user_tierlist_items.tier_id` (próxima
-- migration) passa a apontar pra cá em vez do texto fixo.
create table if not exists public.user_tierlist_tiers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  position   smallint not null check (position between 0 and 5),
  label      text not null check (char_length(trim(label)) between 1 and 12),
  color      text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- DEFERRABLE: reordenar tiers troca duas posições dentro da mesma
  -- transação (ver `replace_user_tierlist_tiers`). Com a checagem imediata,
  -- o passo intermediário — o tier que sai da posição 0 antes de o outro
  -- entrar — já colidiria; adiada pro commit, só o estado final importa.
  unique (user_id, position) deferrable initially deferred
);

create index if not exists idx_user_tierlist_tiers_user
  on public.user_tierlist_tiers(user_id, position);

alter table public.user_tierlist_tiers enable row level security;

-- Mesma filosofia de `user_tierlist_items`: qualquer visitante lê (a
-- definição dos tiers é parte do que a tierlist pública mostra).
drop policy if exists "Tierlist tiers are publicly readable" on public.user_tierlist_tiers;
create policy "Tierlist tiers are publicly readable"
  on public.user_tierlist_tiers for select using (true);

-- Escrita: só o dono, e só enquanto VIP ativo — mesma regra de
-- `user_tierlist_items` (rebaixar de VIP congela, não apaga).
drop policy if exists "VIP users can manage their own tiers" on public.user_tierlist_tiers;
create policy "VIP users can manage their own tiers"
  on public.user_tierlist_tiers for all
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
