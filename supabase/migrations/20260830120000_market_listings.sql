-- Módulo "Mercado": marketplace peer-to-peer dentro da seção "Loja" do menu,
-- que substitui o antigo item "Bazar" (que nunca saiu de "Coming Soon").
--
-- Diferente de `store_products`/`store_orders` (supabase/store.sql) — que é um
-- catálogo administrado pelo time, sem dono e sem RLS por usuário — aqui
-- qualquer membro cria seu próprio anúncio, com link obrigatório da OLX (a
-- venda em si acontece lá fora; o Sunano só cobra uma taxa de publicação).
--
-- IMPORTANTE — aplicar manualmente via Supabase Dashboard (SQL Editor): o
-- histórico de migrations deste projeto está dessincronizado desde 04/08,
-- não rodar via `supabase db push`.

create table if not exists public.market_listings (
  id                   uuid        primary key default gen_random_uuid(),
  seller_id            uuid        not null references auth.users(id) on delete cascade,
  title                text        not null,
  description          text,
  price_cents          integer     not null check (price_cents > 0),   -- preço atual (pode só cair)
  initial_price_cents  integer     not null,                           -- preço no momento da publicação, só auditoria
  olx_url              text        not null,
  images               text[]      not null default '{}',
  status               text        not null default 'pending_review'
                        check (status in ('pending_review', 'active', 'rejected', 'sold', 'removed')),
  fee_cents            integer     not null default 0 check (fee_cents >= 0),
  fee_status           text        not null default 'pending'
                        check (fee_status in ('waived', 'pending', 'paid')),
  is_free_vip_slot     boolean     not null default false,
  stripe_session_id    text        unique,
  rejection_reason     text,
  reviewed_by          uuid        references public.admin_profiles(id),
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Auditoria: toda alteração de preço (não só as reduções), para investigar
-- eventual violação da regra "nunca aumentar" mesmo que a API sempre bloqueie
-- a tentativa antes de persistir.
create table if not exists public.market_listing_price_changes (
  id               uuid        primary key default gen_random_uuid(),
  listing_id       uuid        not null references public.market_listings(id) on delete cascade,
  old_price_cents  integer     not null,
  new_price_cents  integer     not null,
  changed_at       timestamptz not null default now()
);

-- Ban restrito ao Mercado: impede só de criar/editar anúncios, resto da
-- conta (fórum, perfil, login) continua funcionando — não existe hoje
-- nenhum mecanismo de banimento no projeto, este é o de menor escopo possível.
alter table public.user_profiles
  add column if not exists market_banned_at timestamptz,
  add column if not exists market_ban_reason text;

-- Indexes
create index if not exists market_listings_status_idx    on public.market_listings (status);
create index if not exists market_listings_seller_idx    on public.market_listings (seller_id);
create index if not exists market_listings_session_idx   on public.market_listings (stripe_session_id);
create index if not exists market_listing_price_changes_listing_idx
  on public.market_listing_price_changes (listing_id);

-- Auto-update updated_at (reaproveita a função já criada em store.sql)
drop trigger if exists market_listings_updated_at on public.market_listings;
create trigger market_listings_updated_at
  before update on public.market_listings
  for each row execute function public.set_updated_at();

-- RLS
alter table public.market_listings enable row level security;
alter table public.market_listing_price_changes enable row level security;

-- Anyone can read active listings — leitura de rascunho/moderação e toda
-- escrita passam pelo service-role client (mesmo padrão de store_products:
-- ownership é checado manualmente no repositório, não via RLS).
drop policy if exists "Public read active market listings" on public.market_listings;
create policy "Public read active market listings"
  on public.market_listings for select
  using (status = 'active');

-- Sem policies em market_listing_price_changes: só service role (auditoria
-- interna, não é exposta ao público nem ao próprio dono via client direto).
