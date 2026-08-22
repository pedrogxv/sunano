-- Banners rotativos das seções da Loja (/loja): hero do topo ("main"),
-- "Mais vendidos", "Pré-venda", "Pronta entrega", "Itens para o site".
--
-- Sistema paralelo ao `home_banners` (que é da Home "/", não da Loja) — forma
-- diferente o suficiente (section, title, subtitle, cta_text, vídeo) para não
-- valer a pena forçar dentro da tabela existente. Mesmas convenções de
-- storage/RLS/trigger da tabela existente.
--
-- Aplicar via Supabase Dashboard (SQL Editor) — `supabase db push` está
-- quebrado neste projeto (histórico de migration dessincronizado).

create table if not exists public.store_section_banners (
  id         uuid primary key default gen_random_uuid(),
  section    text not null,
  image_url  text,
  video_url  text,
  title      text not null,
  subtitle   text,
  cta_text   text,
  cta_link   text,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.store_section_banners is
  'Banners do carrossel de cada seção da Loja (/loja). Uma seção sem banner ativo cai no grid de produtos existente.';
comment on column public.store_section_banners.section is
  'Qual seção da Loja: main | best_sellers | pre_sale | ready_stock | site_items.';
comment on column public.store_section_banners.image_url is
  'Arte de fundo (usada quando não há vídeo, ou como fallback/poster do vídeo).';
comment on column public.store_section_banners.video_url is
  'Vídeo de fundo (mp4), autoplay+loop+mudo. Nulo = usa image_url.';
comment on column public.store_section_banners.cta_link is
  'Destino do botão CTA. Caminho interno começando com "/" ou URL absoluta http(s). Nulo = banner sem botão de ação.';

alter table public.store_section_banners
  drop constraint if exists store_section_banners_section_check;
alter table public.store_section_banners
  add constraint store_section_banners_section_check
  check (section in ('main', 'best_sellers', 'pre_sale', 'ready_stock', 'site_items'));

-- Precisa de pelo menos uma mídia de fundo.
alter table public.store_section_banners
  drop constraint if exists store_section_banners_media_check;
alter table public.store_section_banners
  add constraint store_section_banners_media_check
  check (image_url is not null or video_url is not null);

alter table public.store_section_banners
  drop constraint if exists store_section_banners_title_check;
alter table public.store_section_banners
  add constraint store_section_banners_title_check
  check (char_length(trim(title)) > 0);

-- Mesma regra de home_banners_link_url_check: só caminho interno ou URL
-- absoluta http(s), barrando `javascript:`/`data:` caso alguém escreva
-- direto no banco. A mesma regra é aplicada na API (Zod) antes de chegar aqui.
alter table public.store_section_banners
  drop constraint if exists store_section_banners_cta_link_check;
alter table public.store_section_banners
  add constraint store_section_banners_cta_link_check
  check (
    cta_link is null
    or cta_link ~ '^/($|[^/\\])'
    or cta_link ~* '^https?://'
  );

create index if not exists store_section_banners_active_order_idx
  on public.store_section_banners (section, sort_order, created_at)
  where is_active = true;

-- ────────────────────────────────────────────
-- updated_at automático — reaproveita a função genérica já criada por
-- home_banners (não referencia nome de tabela, serve para qualquer tabela
-- com coluna updated_at).
-- ────────────────────────────────────────────
drop trigger if exists store_section_banners_touch_updated_at on public.store_section_banners;
create trigger store_section_banners_touch_updated_at
  before update on public.store_section_banners
  for each row execute function public.touch_home_banner_updated_at();

-- ────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────
alter table public.store_section_banners enable row level security;

-- Banner ativo é conteúdo público da Loja; não contém dado de usuário.
drop policy if exists "Active store section banners are publicly readable" on public.store_section_banners;
create policy "Active store section banners are publicly readable"
  on public.store_section_banners
  for select
  using (is_active = true);

-- Escrita só pelo painel (service-role bypassa RLS) ou por perfil admin com
-- permissão store_write — mesma gating do resto do painel /admin/store.
drop policy if exists "Admins with store_write manage store section banners" on public.store_section_banners;
create policy "Admins with store_write manage store section banners"
  on public.store_section_banners
  for all
  using (public.admin_has_permission('store_write'))
  with check (public.admin_has_permission('store_write'));

-- ────────────────────────────────────────────
-- Storage bucket dedicado (imagem + vídeo dos banners de seção)
-- ────────────────────────────────────────────
-- Bucket próprio em vez de reaproveitar `peripherals`: vídeo precisa de um
-- teto de tamanho bem maior que os 500KB-2MB de imagem, e não faz sentido
-- abrir esse teto pro bucket `peripherals` inteiro (usado por avatares,
-- posts do fórum etc.).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-banners',
  'store-banners',
  true,
  20971520, -- 20MB — teto técnico do bucket; o teto real de vídeo (15MB) é aplicado na API
  array['image/webp', 'image/png', 'image/jpeg', 'video/mp4']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Sem policies de storage.objects: todo upload passa pela API admin usando o
-- client de service-role (createSupabaseAdminClient), que já ignora RLS. O
-- bucket é `public = true`, então leitura pública não depende de RLS também
-- (mesmo padrão observado nos buckets `peripherals`/`support`).
