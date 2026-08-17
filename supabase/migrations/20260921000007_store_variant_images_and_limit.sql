-- Até 3 imagens exclusivas por variante (além de image_url, que continua
-- sendo a "capa" da variante — mostrada no círculo/seletor e no carrinho).
-- Tabela separada em vez de virar image_url num array: mesma decisão já
-- tomada para store_product_specs/store_product_peripherals (child table +
-- position, não coluna jsonb) — mais fácil de indexar, ordenar e validar
-- limite via trigger.
create table if not exists public.store_product_variant_images (
  id          uuid        primary key default gen_random_uuid(),
  variant_id  uuid        not null references public.store_product_variants(id) on delete cascade,
  url         text        not null check (char_length(url) <= 2048),
  position    integer     not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists store_product_variant_images_variant_idx
  on public.store_product_variant_images (variant_id, position);

alter table public.store_product_variant_images enable row level security;

-- Mesmo padrão de store_product_variants: leitura pública livre (não expõe
-- preço/estoque, só URLs de imagem), escrita só via service-role.
drop policy if exists "Public read variant images" on public.store_product_variant_images;
create policy "Public read variant images"
  on public.store_product_variant_images for select
  using (true);

-- Trigger em vez de check declarativo: um CHECK não consegue contar linhas
-- irmãs. Bloqueia o INSERT que estouraria 3 imagens pra mesma variante —
-- reforça no banco o limite já validado na API admin.
create or replace function public.enforce_variant_image_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.store_product_variant_images where variant_id = new.variant_id) >= 3 then
    raise exception 'Cada variante pode ter no máximo 3 imagens.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists store_product_variant_images_limit on public.store_product_variant_images;
create trigger store_product_variant_images_limit
  before insert on public.store_product_variant_images
  for each row execute function public.enforce_variant_image_limit();

-- Limite de 12 variantes ativas por produto — mesma lógica de trigger
-- (CHECK não vê linhas irmãs). Só conta variantes ativas: uma variante
-- soft-deleted (is_active = false, ver replaceProductVariants) não ocupa
-- vaga.
create or replace function public.enforce_product_variant_limit()
returns trigger language plpgsql as $$
begin
  if new.is_active and (
    select count(*) from public.store_product_variants
    where product_id = new.product_id and is_active = true and id is distinct from new.id
  ) >= 12 then
    raise exception 'Cada produto pode ter no máximo 12 variantes.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists store_product_variants_limit on public.store_product_variants;
create trigger store_product_variants_limit
  before insert or update on public.store_product_variants
  for each row execute function public.enforce_product_variant_limit();
