-- Vincula produtos da loja a um ou mais periféricos (M2M). Um produto pode
-- referenciar vários periféricos (ex.: kit com mouse + mousepad) e um
-- periférico pode aparecer em vários produtos (ex.: novo + seminovo).
-- Mesmo padrão de user_favorite_peripherals (20260728000001): PK composta,
-- FKs com cascade, leitura pública, escrita só via service-role (API admin).
--
-- IMPORTANTE — aplicar manualmente via Supabase Dashboard (SQL Editor): o
-- histórico de migrations deste projeto está dessincronizado desde 04/08,
-- não rodar via `supabase db push`.

create table if not exists public.store_product_peripherals (
  product_id    uuid not null references public.store_products(id) on delete cascade,
  peripheral_id uuid not null references public.peripherals(id) on delete cascade,
  position      smallint not null default 0,
  created_at    timestamptz not null default now(),
  primary key (product_id, peripheral_id)
);

create index if not exists idx_store_product_peripherals_peripheral
  on public.store_product_peripherals (peripheral_id);

alter table public.store_product_peripherals enable row level security;

drop policy if exists "Public read product peripherals" on public.store_product_peripherals;
create policy "Public read product peripherals"
  on public.store_product_peripherals for select
  using (true);
-- Sem policy de insert/update/delete: escrita só via service-role (API admin).
