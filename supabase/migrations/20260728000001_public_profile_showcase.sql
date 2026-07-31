-- Perfil público (vitrine) — banner, bio, tier de conta, setup, medalhas
-- e periféricos favoritos.
--
-- Contexto: até aqui `/perfil` era apenas a tela de configurações da conta e
-- `user_profiles` só guardava identificação/preferências. Esta migration cria
-- o suporte de dados para a página pública `/perfil/[id]`.
--
-- Todas as tabelas novas são lidas pelos repositórios em `lib/server/**` via
-- cliente service-role (bypassa RLS), seguindo ARQUITETURA.md. As policies
-- abaixo existem como defesa em profundidade caso alguém acesse via SDK.

-- ────────────────────────────────────────────
-- 1. user_profiles: banner, bio e tier de conta
-- ────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists banner_url    text,
  add column if not exists bio           text,
  add column if not exists account_tier  text not null default 'common';

-- Tier de conta. Hoje é definido manualmente (admin); se um dia virar
-- assinatura, só a origem do valor muda — a UI lê sempre esta coluna.
alter table public.user_profiles
  drop constraint if exists user_profiles_account_tier_check;
alter table public.user_profiles
  add constraint user_profiles_account_tier_check
  check (account_tier in ('common', 'vip', 'vip_plus'));

-- "Bio pequena" do wireframe. 160 caracteres = uma/duas linhas no card.
alter table public.user_profiles
  drop constraint if exists user_profiles_bio_length_check;
alter table public.user_profiles
  add constraint user_profiles_bio_length_check
  check (bio is null or char_length(bio) <= 160);

comment on column public.user_profiles.account_tier is
  'Tier da conta: common | vip | vip_plus. Controla mídia animada (GIF) no banner/avatar e os limites de medalhas e favoritos exibidos.';
comment on column public.user_profiles.banner_url is
  'Imagem de capa do perfil. GIF só anima para contas vip/vip_plus.';
comment on column public.user_profiles.bio is
  'Bio curta exibida abaixo do nome (máx. 160 caracteres).';

-- ────────────────────────────────────────────
-- 2. Catálogo de medalhas
-- ────────────────────────────────────────────
create table if not exists public.medals (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  icon_url    text,
  rarity      text not null default 'common'
                check (rarity in ('common', 'rare', 'epic', 'legendary')),
  created_at  timestamptz not null default now()
);

alter table public.medals enable row level security;

-- Catálogo é público (não contém dado de usuário).
drop policy if exists "Medals are publicly readable" on public.medals;
create policy "Medals are publicly readable"
  on public.medals for select using (true);

-- ────────────────────────────────────────────
-- 3. Medalhas conquistadas por usuário
--    `pinned` = medalha escolhida para aparecer no perfil quando o usuário
--    tem mais medalhas do que o limite do seu tier.
-- ────────────────────────────────────────────
create table if not exists public.user_medals (
  user_id      uuid not null references auth.users(id) on delete cascade,
  medal_id     uuid not null references public.medals(id) on delete cascade,
  awarded_at   timestamptz not null default now(),
  pinned       boolean not null default false,
  pinned_order smallint,
  primary key (user_id, medal_id)
);

create index if not exists idx_user_medals_user on public.user_medals(user_id);
create index if not exists idx_user_medals_pinned
  on public.user_medals(user_id, pinned_order) where pinned;

alter table public.user_medals enable row level security;

drop policy if exists "User medals are publicly readable" on public.user_medals;
create policy "User medals are publicly readable"
  on public.user_medals for select using (true);

-- Escrita só pelo service-role: conceder medalha é ação do sistema, e
-- "fixar" passa por `PATCH /api/profile/showcase`, que aplica o limite do
-- tier. Sem policy de update, um usuário não consegue se auto-conceder
-- medalha nem adulterar `awarded_at` (que define a ordem de exibição).
drop policy if exists "Users can pin their own medals" on public.user_medals;

-- ────────────────────────────────────────────
-- 4. Setup do usuário — um slot por tipo de periférico
-- ────────────────────────────────────────────
create table if not exists public.user_setup_items (
  user_id       uuid not null references auth.users(id) on delete cascade,
  slot          text not null
                  check (slot in ('mouse', 'keyboard', 'headset', 'monitor', 'mousepad')),
  peripheral_id uuid references public.peripherals(id) on delete set null,
  custom_label  text,
  updated_at    timestamptz not null default now(),
  primary key (user_id, slot),
  -- Um slot preenchido aponta para um periférico do catálogo OU traz um
  -- texto livre (item que ainda não existe em `peripherals`).
  constraint user_setup_items_has_content
    check (peripheral_id is not null or custom_label is not null)
);

create index if not exists idx_user_setup_items_user on public.user_setup_items(user_id);

alter table public.user_setup_items enable row level security;

drop policy if exists "Setup items are publicly readable" on public.user_setup_items;
create policy "Setup items are publicly readable"
  on public.user_setup_items for select using (true);

drop policy if exists "Users can manage their own setup" on public.user_setup_items;
create policy "Users can manage their own setup"
  on public.user_setup_items for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- 5. Periféricos favoritos
--    O limite (3 / 5 / 8 conforme o tier) é aplicado na camada de domínio,
--    não aqui: rebaixar um usuário de tier não pode apagar dados dele.
-- ────────────────────────────────────────────
create table if not exists public.user_favorite_peripherals (
  user_id       uuid not null references auth.users(id) on delete cascade,
  peripheral_id uuid not null references public.peripherals(id) on delete cascade,
  position      smallint not null default 0,
  created_at    timestamptz not null default now(),
  primary key (user_id, peripheral_id)
);

create index if not exists idx_user_favorites_user
  on public.user_favorite_peripherals(user_id, position);

alter table public.user_favorite_peripherals enable row level security;

drop policy if exists "Favorites are publicly readable" on public.user_favorite_peripherals;
create policy "Favorites are publicly readable"
  on public.user_favorite_peripherals for select using (true);

drop policy if exists "Users can manage their own favorites" on public.user_favorite_peripherals;
create policy "Users can manage their own favorites"
  on public.user_favorite_peripherals for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- 6. Storage: libera o padrão de nome do banner
--    Recria as policies de 20260718_security_hardening.sql incluindo
--    `user-banner-<uid>-*` junto de `user-avatar-<uid>-*`.
-- ────────────────────────────────────────────
drop policy if exists "Scoped upload access" on storage.objects;
create policy "Scoped upload access"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'peripherals'
  and (
    name like 'user-avatar-' || auth.uid()::text || '-%'
    or name like 'user-banner-' || auth.uid()::text || '-%'
    or name like 'admin-avatar-' || auth.uid()::text || '-%'
    or (name like 'blog-cover-%' and public.admin_has_permission('blog_write'))
  )
);

drop policy if exists "Scoped update access" on storage.objects;
create policy "Scoped update access"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'peripherals'
  and (
    name like 'user-avatar-' || auth.uid()::text || '-%'
    or name like 'user-banner-' || auth.uid()::text || '-%'
    or name like 'admin-avatar-' || auth.uid()::text || '-%'
    or (name like 'blog-cover-%' and public.admin_has_permission('blog_write'))
  )
)
with check (
  bucket_id = 'peripherals'
  and (
    name like 'user-avatar-' || auth.uid()::text || '-%'
    or name like 'user-banner-' || auth.uid()::text || '-%'
    or name like 'admin-avatar-' || auth.uid()::text || '-%'
    or (name like 'blog-cover-%' and public.admin_has_permission('blog_write'))
  )
);

drop policy if exists "Scoped delete access" on storage.objects;
create policy "Scoped delete access"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'peripherals'
  and (
    name like 'user-avatar-' || auth.uid()::text || '-%'
    or name like 'user-banner-' || auth.uid()::text || '-%'
    or name like 'admin-avatar-' || auth.uid()::text || '-%'
    or (name like 'blog-cover-%' and public.admin_has_permission('blog_write'))
    or public.admin_has_permission('peripherals_write')
  )
);

-- ────────────────────────────────────────────
-- 7. Seed mínimo do catálogo de medalhas
-- ────────────────────────────────────────────
insert into public.medals (slug, name, description, rarity) values
  ('pioneiro',      'Pioneiro',       'Entrou na comunidade no primeiro ano.',        'legendary'),
  ('colecionador',  'Colecionador',   'Cadastrou um setup completo.',                 'rare'),
  ('critico',       'Crítico',        'Publicou 10 comentários no fórum.',            'common'),
  ('curador',       'Curador',        'Contribuiu com dados de periféricos.',         'epic'),
  ('veterano',      'Veterano',       'Um ano de conta ativa.',                       'rare')
on conflict (slug) do nothing;
