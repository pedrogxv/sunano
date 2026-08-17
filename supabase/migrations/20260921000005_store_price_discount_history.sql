-- Preço promocional "De/Por": promo_price_cents é o preço final vigente;
-- quando null, vale price_cents normalmente. Mesma coisa em variantes, ao
-- lado de price_cents_override.
alter table public.store_products
  add column if not exists promo_price_cents integer check (promo_price_cents is null or promo_price_cents > 0);

alter table public.store_product_variants
  add column if not exists promo_price_cents integer check (promo_price_cents is null or promo_price_cents > 0);

-- Histórico de preço para o gráfico admin. Uma linha por produto OU por
-- variante (variant_id null = preço base do produto). Gravado pela camada
-- de aplicação (store-repository.ts) só quando o preço final efetivamente
-- muda, não a cada save.
create table if not exists public.store_product_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.store_products(id) on delete cascade,
  variant_id uuid references public.store_product_variants(id) on delete cascade,
  price_cents integer not null,
  promo_price_cents integer,
  final_price_cents integer not null,
  created_at timestamptz not null default now()
);

create index if not exists store_product_price_history_product_idx
  on public.store_product_price_history (product_id, created_at);

-- Admin-only (gráfico do painel) — sem leitura pública. RLS ligado, sem
-- policy: acesso só via service-role, mesmo padrão de outras tabelas
-- internas do admin.
alter table public.store_product_price_history enable row level security;
