-- Vitrine da Loja: Hero administrável, barra comercial e favoritos.
--
--   store_hero_slides         o banner principal do topo de /loja. Substitui a
--                             seção "main" de store_section_banners (que só
--                             tinha título/subtítulo/1 botão/1 imagem) com o
--                             que uma campanha precisa: imagem desktop E
--                             mobile, produto relacionado, dois botões e
--                             período. Sem slide no ar, /loja volta à arte
--                             estática de sempre.
--   store_commerce_bar        linha única com a barra de benefícios que fica
--                             logo abaixo do menu da Loja (PIX, parcelas,
--                             frete, suporte) e o modo campanha que a troca
--                             por um aviso ("Beast X V2 em pré-venda").
--   store_product_favorites   produtos favoritados por usuário logado.
--
-- Nenhuma das três tem grant ou policy para anon/authenticated: leitura e
-- escrita passam pelas rotas do Next com service_role
-- (store-hero-repository, store-commerce-bar-repository,
-- store-favorites-repository). RLS ligada e sem policy deixa a REST cega.

-- ────────────────────────────────────────────
-- Hero
-- ────────────────────────────────────────────
create table if not exists public.store_hero_slides (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  subtitle            text,
  -- Arte de fundo. Sem ela o slide precisa de produto: o Hero monta a
  -- composição com a foto do produto (validado na API, não aqui, porque
  -- `on delete set null` do produto quebraria um CHECK que exigisse os dois).
  image_desktop_url   text,
  -- Arte vertical do celular. Nula = usa a de desktop.
  image_mobile_url    text,
  product_id          uuid references public.store_products(id) on delete set null,
  primary_cta_text    text,
  -- Nulo com produto = página do produto.
  primary_cta_link    text,
  secondary_cta_text  text,
  secondary_cta_link  text,
  -- Período da campanha. Nulo = sem limite daquele lado.
  starts_at           timestamptz,
  ends_at             timestamptz,
  is_active           boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.store_hero_slides drop constraint if exists store_hero_slides_title_check;
alter table public.store_hero_slides add constraint store_hero_slides_title_check
  check (char_length(btrim(title)) between 1 and 120);

alter table public.store_hero_slides drop constraint if exists store_hero_slides_subtitle_check;
alter table public.store_hero_slides add constraint store_hero_slides_subtitle_check
  check (subtitle is null or char_length(subtitle) <= 240);

alter table public.store_hero_slides drop constraint if exists store_hero_slides_cta_text_check;
alter table public.store_hero_slides add constraint store_hero_slides_cta_text_check
  check (
    (primary_cta_text is null or char_length(primary_cta_text) <= 40)
    and (secondary_cta_text is null or char_length(secondary_cta_text) <= 40)
  );

-- Mesma regra de store_section_banners_cta_link_check: só caminho interno ou
-- URL absoluta http(s), barrando `javascript:`/`data:` escrito direto no banco.
alter table public.store_hero_slides drop constraint if exists store_hero_slides_cta_link_check;
alter table public.store_hero_slides add constraint store_hero_slides_cta_link_check
  check (
    (primary_cta_link is null or primary_cta_link ~ '^/($|[^/\\])' or primary_cta_link ~* '^https?://')
    and (secondary_cta_link is null or secondary_cta_link ~ '^/($|[^/\\])' or secondary_cta_link ~* '^https?://')
  );

alter table public.store_hero_slides drop constraint if exists store_hero_slides_period_check;
alter table public.store_hero_slides add constraint store_hero_slides_period_check
  check (starts_at is null or ends_at is null or ends_at > starts_at);

create index if not exists store_hero_slides_active_order_idx
  on public.store_hero_slides (sort_order, created_at)
  where is_active = true;

create or replace function public.set_store_hero_slides_updated_at()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_store_hero_slides_updated_at on public.store_hero_slides;
create trigger trg_store_hero_slides_updated_at
  before update on public.store_hero_slides
  for each row execute function public.set_store_hero_slides_updated_at();

alter table public.store_hero_slides enable row level security;

-- ────────────────────────────────────────────
-- Barra comercial
-- ────────────────────────────────────────────
create table if not exists public.store_commerce_bar (
  id                   boolean primary key default true,
  is_enabled           boolean not null default true,
  -- [{ "icon": "pix", "text": "PIX com desconto", "link": null }, ...]
  -- Ícones válidos e limites vivem em lib/store-commerce-bar.ts (a API valida).
  benefits             jsonb not null default '[]'::jsonb,
  -- Modo campanha: liga o aviso no lugar dos benefícios. Fora do período, a
  -- barra volta sozinha aos benefícios, sem precisar desligar à mão.
  campaign_enabled     boolean not null default false,
  campaign_text        text,
  campaign_link_text   text,
  -- Nulo com produto = página do produto.
  campaign_link        text,
  campaign_product_id  uuid references public.store_products(id) on delete set null,
  campaign_tone        text not null default 'amber',
  campaign_starts_at   timestamptz,
  campaign_ends_at     timestamptz,
  updated_by           uuid references auth.users(id) on delete set null,
  updated_at           timestamptz not null default now()
);

alter table public.store_commerce_bar drop constraint if exists store_commerce_bar_single_row;
alter table public.store_commerce_bar add constraint store_commerce_bar_single_row check (id = true);

alter table public.store_commerce_bar drop constraint if exists store_commerce_bar_benefits_check;
alter table public.store_commerce_bar add constraint store_commerce_bar_benefits_check
  check (jsonb_typeof(benefits) = 'array' and jsonb_array_length(benefits) <= 6);

alter table public.store_commerce_bar drop constraint if exists store_commerce_bar_campaign_text_check;
alter table public.store_commerce_bar add constraint store_commerce_bar_campaign_text_check
  check (
    (campaign_text is null or char_length(campaign_text) <= 120)
    and (campaign_link_text is null or char_length(campaign_link_text) <= 30)
  );

alter table public.store_commerce_bar drop constraint if exists store_commerce_bar_campaign_link_check;
alter table public.store_commerce_bar add constraint store_commerce_bar_campaign_link_check
  check (campaign_link is null or campaign_link ~ '^/($|[^/\\])' or campaign_link ~* '^https?://');

alter table public.store_commerce_bar drop constraint if exists store_commerce_bar_campaign_tone_check;
alter table public.store_commerce_bar add constraint store_commerce_bar_campaign_tone_check
  check (campaign_tone in ('amber', 'emerald', 'violet', 'rose', 'sky'));

alter table public.store_commerce_bar drop constraint if exists store_commerce_bar_campaign_period_check;
alter table public.store_commerce_bar add constraint store_commerce_bar_campaign_period_check
  check (campaign_starts_at is null or campaign_ends_at is null or campaign_ends_at > campaign_starts_at);

create or replace function public.set_store_commerce_bar_updated_at()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_store_commerce_bar_updated_at on public.store_commerce_bar;
create trigger trg_store_commerce_bar_updated_at
  before update on public.store_commerce_bar
  for each row execute function public.set_store_commerce_bar_updated_at();

-- Linha única já nasce com os quatro benefícios padrão. `do nothing`: rodar
-- de novo não apaga o que o admin configurou.
insert into public.store_commerce_bar (id, benefits)
values (
  true,
  '[
    {"icon": "pix", "text": "PIX com desconto", "link": null},
    {"icon": "card", "text": "Até 6x sem juros", "link": null},
    {"icon": "truck", "text": "Frete calculado no carrinho", "link": null},
    {"icon": "support", "text": "Suporte especializado", "link": "/suporte"}
  ]'::jsonb
)
on conflict (id) do nothing;

alter table public.store_commerce_bar enable row level security;

-- ────────────────────────────────────────────
-- Favoritos
-- ────────────────────────────────────────────
create table if not exists public.store_product_favorites (
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  uuid not null references public.store_products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index if not exists store_product_favorites_user_idx
  on public.store_product_favorites (user_id, created_at desc);

alter table public.store_product_favorites enable row level security;

revoke all on public.store_hero_slides, public.store_commerce_bar, public.store_product_favorites
  from anon, authenticated;

revoke execute on function public.set_store_hero_slides_updated_at() from public, anon, authenticated;
revoke execute on function public.set_store_commerce_bar_updated_at() from public, anon, authenticated;
