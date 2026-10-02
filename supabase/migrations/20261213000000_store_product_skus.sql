-- SKU por combinação: Cor × opções de grupo.
--
-- Até aqui a variante (Cor) tinha colunas de preço e estoque que o admin
-- nunca preenchia (a tela gravava null), e o grupo de opção (Tamanho,
-- Switch...) só sabia mudar o preço e ficar "esgotado". No Beast X, trocar
-- de Mini para Max não trocava foto, estoque nem código: Max em Rosa e Max
-- em Preto são produtos físicos diferentes, e nenhum dos dois níveis
-- conseguia dizer isso.
--
-- Cada linha aqui é UMA combinação vendável (a cor escolhida + uma opção por
-- grupo), com código, preço, promoção, estoque, foto e "esgotado" próprios.
-- Tudo é opcional: coluna nula cai no nível de cima (opção → cor → produto),
-- então produto sem matriz continua funcionando exatamente como antes.
--
-- A regra de leitura mora em `lib/store-sku.ts`, e é a MESMA na vitrine, na
-- página do produto, no carrinho e no checkout.

-- Ordem canônica das opções: a combinação {Max, Omron} e {Omron, Max} é a
-- mesma, e a unicidade só funciona se o array chegar sempre na mesma ordem.
create or replace function public.sort_uuid_array(p uuid[])
returns uuid[] language sql immutable parallel safe as $$
  select coalesce(array_agg(x order by x), '{}'::uuid[]) from unnest(p) as x;
$$;

create table if not exists public.store_product_skus (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.store_products(id) on delete cascade,
  -- Nulo quando o produto não tem Cor, só grupos de opção.
  variant_id uuid references public.store_product_variants(id) on delete cascade,
  -- Uma opção por grupo, ordenadas (ver sort_uuid_array). Sem FK: Postgres
  -- não referencia elemento de array. Opção apagada deixa a linha morta,
  -- que nunca mais casa com uma seleção e some no próximo save do admin.
  option_ids uuid[] not null default '{}',
  sku text,
  price_cents integer,
  promo_price_cents integer,
  -- Nulo = sem controle de estoque nesta combinação (vale o da cor/produto).
  stock integer,
  image_url text,
  is_sold_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_product_skus_option_ids_sorted check (option_ids = public.sort_uuid_array(option_ids)),
  constraint store_product_skus_price_check check (price_cents is null or price_cents > 0),
  constraint store_product_skus_promo_check check (promo_price_cents is null or promo_price_cents > 0),
  constraint store_product_skus_stock_check check (stock is null or stock >= 0),
  constraint store_product_skus_sku_check check (sku is null or char_length(sku) between 1 and 64)
);

create unique index if not exists store_product_skus_combo_uniq
  on public.store_product_skus (product_id, (coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)), option_ids);

-- Código de SKU é identidade do item no estoque físico: dois produtos com o
-- mesmo código fariam a separação do pedido pegar a caixa errada.
create unique index if not exists store_product_skus_sku_uniq
  on public.store_product_skus (lower(sku)) where sku is not null;

alter table public.store_product_skus enable row level security;
revoke all on public.store_product_skus from public, anon, authenticated;
grant all on public.store_product_skus to service_role;

comment on table public.store_product_skus is
  'Combinação vendável (cor + uma opção por grupo) com SKU, preço, estoque e foto próprios. Coluna nula herda do nível de cima. Regra de leitura em lib/store-sku.ts.';

-- SKU de produto simples (sem cor nem grupo): a combinação é o próprio produto.
alter table public.store_products
  add column if not exists sku text;

alter table public.store_products
  drop constraint if exists store_products_sku_check;
alter table public.store_products
  add constraint store_products_sku_check check (sku is null or char_length(sku) between 1 and 64);

create unique index if not exists store_products_sku_uniq
  on public.store_products (lower(sku)) where sku is not null;

-- ────────────────────────────────────────────
-- Estoque da combinação: mesmo contrato das RPCs de produto e de cor
-- (`UPDATE ... WHERE stock >= quantidade`, devolve false se não coube).
-- ────────────────────────────────────────────
create or replace function public.decrement_sku_stock(p_sku_id uuid, p_quantity integer)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_updated boolean;
begin
  update public.store_product_skus
  set stock = case when stock is null then null else stock - p_quantity end,
      updated_at = now()
  where id = p_sku_id and (stock is null or stock >= p_quantity)
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

revoke execute on function public.decrement_sku_stock(uuid, integer) from public, anon, authenticated;
grant execute on function public.decrement_sku_stock(uuid, integer) to service_role;

create or replace function public.increment_sku_stock(p_sku_id uuid, p_quantity integer)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_updated boolean;
begin
  update public.store_product_skus
  set stock = case when stock is null then null else stock + p_quantity end,
      updated_at = now()
  where id = p_sku_id
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

revoke execute on function public.increment_sku_stock(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_sku_stock(uuid, integer) to service_role;

-- ────────────────────────────────────────────
-- Diário de reservas: a linha precisa dizer QUAL estoque foi descontado,
-- senão o cron devolveria à cor uma unidade que saiu da combinação.
-- ────────────────────────────────────────────
alter table public.store_stock_reservations
  add column if not exists sku_id uuid references public.store_product_skus(id) on delete cascade;

create or replace function public.release_orphaned_stock_reservations(
  p_older_than_minutes integer default 15
)
returns integer language plpgsql security definer
set search_path = public as $$
declare
  v_released integer := 0;
  v_row record;
begin
  for v_row in
    delete from public.store_stock_reservations
    where created_at < now() - make_interval(mins => p_older_than_minutes)
    returning product_id, variant_id, sku_id, quantity
  loop
    if v_row.sku_id is not null then
      update public.store_product_skus
      set stock = case when stock is null then null else stock + v_row.quantity end,
          updated_at = now()
      where id = v_row.sku_id;
    elsif v_row.variant_id is not null then
      update public.store_product_variants
      set stock = case when stock is null then null else stock + v_row.quantity end,
          updated_at = now()
      where id = v_row.variant_id;
    else
      -- Reserva de pré-venda também passa pelo diário (`reserve_preorder`),
      -- mas nunca descontou estoque: devolver aqui inventaria unidades.
      update public.store_products
      set stock = case when stock is null then null else stock + v_row.quantity end,
          updated_at = now()
      where id = v_row.product_id and sale_type <> 'pre_order';
    end if;
    v_released := v_released + 1;
  end loop;

  return v_released;
end;
$$;

revoke execute on function public.release_orphaned_stock_reservations(integer)
  from public, anon, authenticated;
grant execute on function public.release_orphaned_stock_reservations(integer)
  to service_role;

-- ────────────────────────────────────────────
-- "Avise-me" da combinação: mesma regra da cor (20260929000000). Quem pediu
-- aviso numa combinação esgotada se inscreveu na cor dela (ou no produto,
-- sem cor), e é esse o aviso que dispara quando ela volta.
-- ────────────────────────────────────────────
create or replace function public.trg_store_sku_restock()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_was_out bool := old.is_sold_out or (old.stock is not null and old.stock = 0);
  v_is_out  bool := new.is_sold_out or (new.stock is not null and new.stock = 0);
begin
  if v_was_out and not v_is_out then
    perform public.notify_restock(new.product_id, new.variant_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_store_sku_restock() from public, anon, authenticated;

drop trigger if exists trg_store_sku_restock on public.store_product_skus;
create trigger trg_store_sku_restock
  after update of stock, is_sold_out on public.store_product_skus
  for each row execute function public.trg_store_sku_restock();

-- ────────────────────────────────────────────
-- A matriz substitui `store_product_variant_combinations` (par cor × opção
-- marcado como esgotado). Cada par vira as combinações completas que o
-- contêm, com `is_sold_out`. A tabela antiga fica vazia e sem uso.
-- ────────────────────────────────────────────
do $$
declare
  r     record;
  v_ids uuid[];
begin
  for r in
    select c.product_id, c.variant_id, c.option_id, o.group_id
      from public.store_product_variant_combinations c
      join public.store_product_variant_group_options o on o.id = c.option_id
  loop
    for v_ids in
      with recursive grp as (
        select g.id, row_number() over (order by g.position, g.id) as rn
          from public.store_product_variant_groups g
         where g.product_id = r.product_id and g.id <> r.group_id
      ), combos(rn, ids) as (
        select 0::bigint, array[r.option_id]::uuid[]
        union all
        select grp.rn, combos.ids || o.id
          from combos
          join grp on grp.rn = combos.rn + 1
          join public.store_product_variant_group_options o on o.group_id = grp.id
      )
      select public.sort_uuid_array(ids) from combos where rn = (select count(*) from grp)
    loop
      insert into public.store_product_skus (product_id, variant_id, option_ids, is_sold_out)
      values (r.product_id, r.variant_id, v_ids, true)
      on conflict (product_id, (coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)), option_ids)
      do update set is_sold_out = true, updated_at = now();
    end loop;
  end loop;

  delete from public.store_product_variant_combinations;
end;
$$;

comment on table public.store_product_variant_combinations is
  'Sem uso desde 20261213000000: o esgotado por combinação mora em store_product_skus.is_sold_out.';
