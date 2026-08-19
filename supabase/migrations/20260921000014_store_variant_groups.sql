-- "Cor" (store_product_variants) ganha o mesmo tratamento de
-- store_products.is_sold_out (ver 20260921000010_store_product_sold_out.sql):
-- um toggle manual, reversível, independente de stock=0. stock continua
-- controlando o decremento real no checkout; is_sold_out só bloqueia a
-- seleção na loja mesmo com stock > 0 (ou > null).
alter table public.store_product_variants
  add column if not exists is_sold_out boolean not null default false;

-- Grupos de variantes por texto (Switch, Voltagem, Tamanho...) — segunda
-- dimensão de opção do produto, independente de "Cor". Cada opção é só um
-- botão de texto (sem foto/swatch) e pode sobrescrever o preço do produto,
-- igual price_cents_override em store_product_variants. Sem controle de
-- estoque numérico: só um "Esgotado" manual por opção, igual a coluna
-- acima. Sem is_active/soft-delete como store_product_variants tem — nada
-- referencia essas linhas por FK (diferente de store_product_variants, que
-- é referenciada por variant_id em store_orders), então a API admin pode
-- fazer delete-then-insert direto a cada save, mesmo padrão hoje usado por
-- replaceProductSpecs.
create table if not exists public.store_product_variant_groups (
  id          uuid        primary key default gen_random_uuid(),
  product_id  uuid        not null references public.store_products(id) on delete cascade,
  name        text        not null check (char_length(name) between 1 and 60),
  position    integer     not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.store_product_variant_group_options (
  id                    uuid        primary key default gen_random_uuid(),
  group_id              uuid        not null references public.store_product_variant_groups(id) on delete cascade,
  label                 text        not null check (char_length(label) between 1 and 60),
  price_cents_override  integer     check (price_cents_override is null or price_cents_override > 0),
  is_sold_out           boolean     not null default false,
  position              integer     not null default 0,
  created_at            timestamptz not null default now()
);

create index if not exists store_product_variant_groups_product_idx
  on public.store_product_variant_groups (product_id, position);
create index if not exists store_product_variant_group_options_group_idx
  on public.store_product_variant_group_options (group_id, position);

alter table public.store_product_variant_groups enable row level security;
alter table public.store_product_variant_group_options enable row level security;

-- Leitura pública livre — mesmo padrão de store_product_variant_images
-- (não expõe estoque, só preço/label, que já é público via store_products).
-- Escrita só via service-role (API admin).
drop policy if exists "Public read variant groups" on public.store_product_variant_groups;
create policy "Public read variant groups"
  on public.store_product_variant_groups for select
  using (true);

drop policy if exists "Public read variant group options" on public.store_product_variant_group_options;
create policy "Public read variant group options"
  on public.store_product_variant_group_options for select
  using (true);

-- Limite de 6 grupos por produto e 12 opções por grupo — mesmo padrão de
-- trigger usado em enforce_product_variant_limit (um CHECK não vê linhas
-- irmãs). Reforça no banco o que a API admin já valida.
create or replace function public.enforce_variant_group_limit()
returns trigger language plpgsql as $$
begin
  if (
    select count(*) from public.store_product_variant_groups
    where product_id = new.product_id and id is distinct from new.id
  ) >= 6 then
    raise exception 'Cada produto pode ter no máximo 6 grupos de variantes.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists store_product_variant_groups_limit on public.store_product_variant_groups;
create trigger store_product_variant_groups_limit
  before insert on public.store_product_variant_groups
  for each row execute function public.enforce_variant_group_limit();

create or replace function public.enforce_variant_group_option_limit()
returns trigger language plpgsql as $$
begin
  if (
    select count(*) from public.store_product_variant_group_options
    where group_id = new.group_id and id is distinct from new.id
  ) >= 12 then
    raise exception 'Cada grupo de variantes pode ter no máximo 12 opções.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists store_product_variant_group_options_limit on public.store_product_variant_group_options;
create trigger store_product_variant_group_options_limit
  before insert on public.store_product_variant_group_options
  for each row execute function public.enforce_variant_group_option_limit();
