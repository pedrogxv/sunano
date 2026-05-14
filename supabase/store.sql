-- Store: products (Loja + Bazar) and orders

create table if not exists public.store_products (
  id            uuid        primary key default gen_random_uuid(),
  slug          text        unique not null,
  name          text        not null,
  description   text,
  price_cents   integer     not null check (price_cents > 0),   -- BRL centavos
  stock         integer     not null default 0 check (stock >= 0),
  images        text[]      not null default '{}',
  category      text,                                            -- loose tag: 'mouse', 'keyboard', etc.
  type          text        not null check (type in ('store', 'bazaar')),
  condition     text        not null default 'new'
                            check (condition in ('new', 'used', 'opened')),
  condition_notes text,                                          -- visible to buyers on bazar items
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.store_orders (
  id                      uuid        primary key default gen_random_uuid(),
  stripe_session_id       text        unique,
  stripe_payment_intent_id text,
  customer_email          text,
  customer_name           text,
  items                   jsonb       not null,   -- [{id, name, price_cents, quantity}]
  total_cents             integer     not null,
  status                  text        not null default 'pending'
                          check (status in ('pending', 'paid', 'cancelled', 'refunded')),
  payment_method          text,                   -- 'card' | 'pix'
  metadata                jsonb       not null default '{}',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Indexes
create index if not exists store_products_type_idx    on public.store_products (type);
create index if not exists store_products_active_idx  on public.store_products (is_active);
create index if not exists store_products_slug_idx    on public.store_products (slug);
create index if not exists store_orders_session_idx   on public.store_orders (stripe_session_id);
create index if not exists store_orders_status_idx    on public.store_orders (status);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger store_products_updated_at
  before update on public.store_products
  for each row execute function public.set_updated_at();

create trigger store_orders_updated_at
  before update on public.store_orders
  for each row execute function public.set_updated_at();

-- Stock decrement RPC (called by webhook — runs with service-role, safe)
create or replace function public.decrement_store_stock(p_product_id uuid, p_quantity integer)
returns void language plpgsql security definer as $$
begin
  update public.store_products
  set stock = greatest(0, stock - p_quantity),
      updated_at = now()
  where id = p_product_id;
end;
$$;

-- RLS
alter table public.store_products enable row level security;
alter table public.store_orders   enable row level security;

-- Anyone can read active products
create policy "Public read active store products"
  on public.store_products for select
  using (is_active = true);

-- Service role bypasses RLS (used by admin API routes and webhook)
-- No additional policies needed for write: admin API uses service-role client.

-- Orders are only visible via service role (webhook + admin API routes).
-- No public policies on store_orders intentionally.
