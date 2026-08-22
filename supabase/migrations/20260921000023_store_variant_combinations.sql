-- Estoque "Esgotado" por combinação Cor × Variante. Hoje store_product_variants
-- (Cor) e store_product_variant_group_options (Variante) têm is_sold_out
-- independentes, então não dá pra esgotar só "Preto + Fechada" mantendo
-- "Preto + Aberta" disponível. Esta tabela guarda os pares (cor, opção) que
-- estão esgotados — a existência da linha já significa "esgotado", sem
-- coluna booleana. Quando o produto tem 2+ grupos de variante, cada grupo
-- forma sua própria matriz com a Cor (não existe combinação cruzando dois
-- grupos ao mesmo tempo).
create table if not exists public.store_product_variant_combinations (
  id          uuid        primary key default gen_random_uuid(),
  product_id  uuid        not null references public.store_products(id) on delete cascade,
  variant_id  uuid        not null references public.store_product_variants(id) on delete cascade,
  option_id   uuid        not null references public.store_product_variant_group_options(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (variant_id, option_id)
);

create index if not exists store_product_variant_combinations_product_idx
  on public.store_product_variant_combinations (product_id);
create index if not exists store_product_variant_combinations_option_idx
  on public.store_product_variant_combinations (option_id);

alter table public.store_product_variant_combinations enable row level security;

-- Leitura pública livre — mesmo padrão de store_product_variant_groups
-- (não expõe estoque numérico, só quais combinações estão bloqueadas).
-- Escrita só via service-role (API admin).
drop policy if exists "Public read variant combinations" on public.store_product_variant_combinations;
create policy "Public read variant combinations"
  on public.store_product_variant_combinations for select
  using (true);

-- Backfill: produtos que já têm Cor E Variante juntos hoje, com is_sold_out
-- marcado isoladamente em qualquer um dos dois lados, nascem com a
-- combinação inteira esgotada — lado mais seguro (nunca destrava algo que
-- já está bloqueado). Admin ajusta célula a célula na matriz depois.
insert into public.store_product_variant_combinations (product_id, variant_id, option_id)
select v.product_id, v.id, o.id
from public.store_product_variants v
join public.store_product_variant_groups g on g.product_id = v.product_id
join public.store_product_variant_group_options o on o.group_id = g.id
where v.is_active = true and (v.is_sold_out or o.is_sold_out)
on conflict (variant_id, option_id) do nothing;
