-- Listas de compras estilo Amazon: uma lista padrão "Favoritos" por usuário
-- (criada sob demanda) mais listas nomeadas extras, cada uma podendo ser
-- tornada pública com um link compartilhável (share_token opaco). Sem policy
-- pública de select: a leitura pública passa pelo repositório via
-- service-role, buscando por share_token — mesmo padrão de store_orders.
create table if not exists public.store_wishlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'Favoritos',
  is_default  boolean not null default false,
  is_public   boolean not null default false,
  share_token text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists store_wishlists_one_default_per_user
  on public.store_wishlists (user_id) where is_default;

create table if not exists public.store_wishlist_items (
  id          uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.store_wishlists(id) on delete cascade,
  product_id  uuid not null references public.store_products(id) on delete cascade,
  note        text,
  created_at  timestamptz not null default now(),
  unique (wishlist_id, product_id)
);

create index if not exists store_wishlist_items_wishlist_idx
  on public.store_wishlist_items (wishlist_id);

drop trigger if exists store_wishlists_updated_at on public.store_wishlists;
create trigger store_wishlists_updated_at
  before update on public.store_wishlists
  for each row execute function public.set_updated_at();

alter table public.store_wishlists enable row level security;
alter table public.store_wishlist_items enable row level security;
-- Sem policies públicas intencionalmente: toda leitura/escrita passa pelo
-- repositório com service-role, que checa user_id (dono) ou share_token (link
-- público) em código.
