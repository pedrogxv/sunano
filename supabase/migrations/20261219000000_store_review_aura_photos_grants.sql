-- Avaliação de produto da Loja: foto, Aura e liberação para cliente antigo.
--
-- Decidido em 07/10/2026:
--   1. A avaliação aceita até 3 fotos (`image_urls`).
--   2. Avaliar rende Aura: +10 sem foto, +20 com pelo menos uma foto.
--   3. O admin pode liberar a avaliação de um produto para um cliente que
--      comprou FORA do site (`store_review_grants`), para a loja nascer com
--      avaliações de quem já comprou antes dela existir.
--
-- ── Origem da avaliação ──────────────────────────────────────────────────
-- `origin = 'order'`: pedido pago no site, carrega "Compra verificada".
-- `origin = 'grant'`: liberada pelo admin. NÃO marca `is_verified_purchase`
-- (não há pedido no site que prove a compra) e a tela mostra "Cliente
-- Sunano", o mesmo selo dos depoimentos de `store_testimonials`. Misturar os
-- dois faria o selo de compra verificada mentir.
--
-- ── Aura ─────────────────────────────────────────────────────────────────
-- Valor FIXO, sem o multiplicador de ofensiva/VIP: é recompensa por
-- contribuição, na mesma régua de pedido de periférico (20261203000000) e de
-- compra (20261213000002). Espelha STORE_REVIEW_AURA em
-- lib/store-review-aura.ts; o daqui é o que vale.
--
-- Em TRIGGER, não na rota: nenhum caminho novo de criar avaliação esquece de
-- pagar. BEFORE INSERT, então o crédito e a avaliação são a mesma transação:
-- se o insert falha (ex.: segunda avaliação do mesmo produto), a Aura não
-- entra.
--
-- Uma vez só, por dois cadeados:
--   1. `store_product_reviews.aura_rewarded`, marcado na própria linha.
--   2. Índice único do ledger por (pessoa, produto): mesmo que a avaliação
--      seja apagada e refeita, o produto paga uma vez.
-- Ocultar a avaliação na moderação NÃO estorna (mesmo motivo dos outros
-- créditos fixos: o saldo negativo de um estorno não tem tratamento).

-- ────────────────────────────────────────────
-- Colunas novas em store_product_reviews
-- ────────────────────────────────────────────
alter table public.store_product_reviews
  add column if not exists image_urls text[] not null default '{}';

alter table public.store_product_reviews
  drop constraint if exists store_product_reviews_image_urls_max;
alter table public.store_product_reviews
  add constraint store_product_reviews_image_urls_max
  check (cardinality(image_urls) <= 3);

alter table public.store_product_reviews
  add column if not exists origin text not null default 'order';

alter table public.store_product_reviews
  drop constraint if exists store_product_reviews_origin_check;
alter table public.store_product_reviews
  add constraint store_product_reviews_origin_check
  check (origin in ('order', 'grant'));

alter table public.store_product_reviews
  add column if not exists aura_rewarded integer;

comment on column public.store_product_reviews.origin is
  'order = pedido pago no site (Compra verificada); grant = liberada pelo admin para cliente que comprou fora do site (Cliente Sunano).';
comment on column public.store_product_reviews.aura_rewarded is
  'Aura creditada ao autor pela avaliação (10, ou 20 com foto). null = nada creditado.';

-- As colunas novas NÃO entram no grant de coluna de 20261113000000: a leitura
-- das avaliações é toda pela rota (service_role).

-- ────────────────────────────────────────────
-- Liberação de avaliação para cliente antigo
-- ────────────────────────────────────────────
-- Uma linha = "esta pessoa pode avaliar este produto". FK composto não se
-- aplica (o produto não é do usuário); a posse é conferida pela rota, que só
-- aceita grant do próprio `user_id` da sessão.
create table if not exists public.store_review_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  uuid not null references public.store_products(id) on delete cascade,
  granted_by  uuid references auth.users(id) on delete set null,
  note        text check (note is null or char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists store_review_grants_product_idx
  on public.store_review_grants (product_id);

alter table public.store_review_grants enable row level security;
-- Sem policy: leitura e escrita só via service_role (rotas do Next).
revoke all on public.store_review_grants from anon, authenticated;

-- ────────────────────────────────────────────
-- Motivo novo no ledger. O check é recriado A PARTIR DO QUE ESTÁ NO BANCO
-- (mesmo cuidado de 20261203000000: o histórico já divergiu do remoto).
-- ────────────────────────────────────────────
alter table public.aura_ledger
  add column if not exists source_store_product_id uuid references public.store_products(id) on delete set null;

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
    where conname = 'aura_ledger_reason_check'
      and conrelid = 'public.aura_ledger'::regclass;

  if v_def is null then
    raise exception 'aura_ledger_reason_check não encontrado';
  end if;

  if position('''store_review''' in v_def) = 0 then
    if position('ARRAY[' in v_def) = 0 then
      raise exception 'formato inesperado de aura_ledger_reason_check: %', v_def;
    end if;
    v_def := regexp_replace(v_def, 'ARRAY\[', 'ARRAY[''store_review''::text, ');
    alter table public.aura_ledger drop constraint aura_ledger_reason_check;
    execute format('alter table public.aura_ledger add constraint aura_ledger_reason_check %s', v_def);
  end if;
end;
$$;

create unique index if not exists aura_ledger_store_review_unique
  on public.aura_ledger (user_id, source_store_product_id)
  where reason = 'store_review';

-- ────────────────────────────────────────────
-- Recompensa
-- ────────────────────────────────────────────
create or replace function public.trg_reward_store_review_aura()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_reward   integer;
  v_inserted integer;
begin
  if new.aura_rewarded is not null then
    return new;
  end if;

  v_reward := case when cardinality(new.image_urls) > 0 then 20 else 10 end;

  -- Ledger primeiro: o índice único decide se esta pessoa já recebeu por
  -- este produto. Só credita a carteira se a linha entrou.
  insert into public.aura_ledger (user_id, delta, reason, source_store_product_id)
  values (new.user_id, v_reward, 'store_review', new.product_id)
  on conflict (user_id, source_store_product_id) where reason = 'store_review' do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return new;
  end if;

  insert into public.user_aura_wallet (user_id, balance) values (new.user_id, v_reward)
    on conflict (user_id) do update
      set balance = user_aura_wallet.balance + v_reward, updated_at = now();

  new.aura_rewarded := v_reward;
  return new;
end;
$$;

revoke execute on function public.trg_reward_store_review_aura() from public, anon, authenticated;

drop trigger if exists trg_store_product_reviews_reward_aura on public.store_product_reviews;
create trigger trg_store_product_reviews_reward_aura
  before insert on public.store_product_reviews
  for each row execute function public.trg_reward_store_review_aura();

-- ────────────────────────────────────────────
-- Bucket das fotos de avaliação. Público (a foto é conteúdo da vitrine) e
-- sem policy em storage.objects: upload só pela rota, com admin client.
-- ────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-reviews', 'store-reviews', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
