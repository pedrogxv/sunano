-- Conteúdo detalhado do produto (Características, Especificação Técnica, vídeo
-- de análise) — só admin escreve, listado publicamente na página do produto.
alter table public.store_products
  add column if not exists features text[] not null default '{}',
  add column if not exists video_url text;

create table if not exists public.store_product_specs (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.store_products(id) on delete cascade,
  label      text not null,
  value      text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists store_product_specs_product_idx
  on public.store_product_specs (product_id, position);

alter table public.store_product_specs enable row level security;

drop policy if exists "Public read specs" on public.store_product_specs;
create policy "Public read specs"
  on public.store_product_specs for select
  using (true);
-- Sem policy de insert/update/delete: escrita só via service-role (API admin).
