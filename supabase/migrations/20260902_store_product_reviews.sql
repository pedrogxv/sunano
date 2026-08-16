-- Reviews de usuários (só quem comprou o produto, publicadas imediatamente e
-- moderadas reativamente pelo admin — mesmo padrão do fórum) e a análise
-- oficial do Sunano (dono do site), que é editorial e separada por natureza:
-- 1 por produto, pode ter vídeo, e é assinada por um admin, não um comprador.
create table if not exists public.store_product_reviews (
  id                    uuid primary key default gen_random_uuid(),
  product_id            uuid not null references public.store_products(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  order_id              uuid references public.store_orders(id) on delete set null,
  rating                integer not null check (rating between 1 and 5),
  title                 text,
  body                  text not null check (char_length(body) between 1 and 4000),
  is_verified_purchase  boolean not null default false,
  status                text not null default 'published'
                        check (status in ('published', 'hidden')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (product_id, user_id)
);

create index if not exists store_product_reviews_product_idx
  on public.store_product_reviews (product_id, status, created_at desc);

drop trigger if exists store_product_reviews_updated_at on public.store_product_reviews;
create trigger store_product_reviews_updated_at
  before update on public.store_product_reviews
  for each row execute function public.set_updated_at();

alter table public.store_product_reviews enable row level security;

drop policy if exists "Public read published reviews" on public.store_product_reviews;
create policy "Public read published reviews"
  on public.store_product_reviews for select
  using (status = 'published');
-- Sem policy de insert/update/delete: escrita só via service-role (API).

create table if not exists public.store_product_sunano_reviews (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null unique references public.store_products(id) on delete cascade,
  rating           integer check (rating between 1 and 5),
  title            text not null,
  body             text not null,
  video_url        text,
  author_admin_id  uuid references public.admin_profiles(id) on delete set null,
  published        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists store_product_sunano_reviews_updated_at on public.store_product_sunano_reviews;
create trigger store_product_sunano_reviews_updated_at
  before update on public.store_product_sunano_reviews
  for each row execute function public.set_updated_at();

alter table public.store_product_sunano_reviews enable row level security;

drop policy if exists "Public read published sunano review" on public.store_product_sunano_reviews;
create policy "Public read published sunano review"
  on public.store_product_sunano_reviews for select
  using (published = true);
