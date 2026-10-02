-- Hero da Loja com função de conversão.
--
--   store_hero_slides.highlight        o que o slide está vendendo: campanha,
--                                      lançamento, produto em destaque ou
--                                      oferta. Vira a etiqueta acima do título
--                                      (cor e ícone por tipo, em lib/store-hero.ts).
--   store_hero_slides.highlight_label  texto próprio da etiqueta ("Black Week",
--                                      "Só esta semana"). Nulo = rótulo do tipo.
--   subtítulo curto                    teto de 240 → 140: o Hero de campanha
--                                      é título + uma frase, não parágrafo.
--   store_hero_settings                linha única com os selos de curadoria
--                                      que ficam colados no Hero (Produtos
--                                      testados, Reviews independentes,
--                                      Curadoria Sunano, Database completo) e
--                                      a nota dos compradores. Valem para
--                                      todos os slides, e também para a arte
--                                      estática: é o posicionamento da Loja,
--                                      não a campanha.
--
-- Mesma regra de 20261204000000: sem grant nem policy para anon/authenticated.
-- A vitrine lê no servidor (store-hero-repository) e o painel grava por
-- /api/admin/store-hero/settings.

-- ────────────────────────────────────────────
-- Etiqueta do slide
-- ────────────────────────────────────────────
alter table public.store_hero_slides add column if not exists highlight text;
alter table public.store_hero_slides add column if not exists highlight_label text;

alter table public.store_hero_slides drop constraint if exists store_hero_slides_highlight_check;
alter table public.store_hero_slides add constraint store_hero_slides_highlight_check
  check (highlight is null or highlight in ('campaign', 'launch', 'product', 'offer'));

alter table public.store_hero_slides drop constraint if exists store_hero_slides_highlight_label_check;
alter table public.store_hero_slides add constraint store_hero_slides_highlight_label_check
  check (highlight_label is null or char_length(btrim(highlight_label)) between 1 and 28);

alter table public.store_hero_slides drop constraint if exists store_hero_slides_subtitle_check;
alter table public.store_hero_slides add constraint store_hero_slides_subtitle_check
  check (subtitle is null or char_length(subtitle) <= 140);

-- ────────────────────────────────────────────
-- Selos de curadoria
-- ────────────────────────────────────────────
create table if not exists public.store_hero_settings (
  id             boolean primary key default true,
  seals_enabled  boolean not null default true,
  -- [{ "icon": "tested", "title": "Produtos testados", "description": "...", "link": null }, ...]
  -- Ícones válidos e limites vivem em lib/store-hero.ts (a API valida).
  seals          jsonb not null default '[]'::jsonb,
  -- Nota média das avaliações publicadas, com link para /loja/avaliacoes.
  -- Só aparece com pelo menos uma avaliação.
  show_rating    boolean not null default true,
  updated_by     uuid references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now()
);

alter table public.store_hero_settings drop constraint if exists store_hero_settings_single_row;
alter table public.store_hero_settings add constraint store_hero_settings_single_row check (id = true);

alter table public.store_hero_settings drop constraint if exists store_hero_settings_seals_check;
alter table public.store_hero_settings add constraint store_hero_settings_seals_check
  check (jsonb_typeof(seals) = 'array' and jsonb_array_length(seals) <= 4);

create or replace function public.set_store_hero_settings_updated_at()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_store_hero_settings_updated_at on public.store_hero_settings;
create trigger trg_store_hero_settings_updated_at
  before update on public.store_hero_settings
  for each row execute function public.set_store_hero_settings_updated_at();

alter table public.store_hero_settings enable row level security;

revoke all on public.store_hero_settings from anon, authenticated;
revoke execute on function public.set_store_hero_settings_updated_at() from public, anon, authenticated;

-- Os quatro selos pedidos, já ligados ao resto do site. O painel edita a
-- partir daqui; `do nothing` não sobrescreve o que já tiver sido salvo.
insert into public.store_hero_settings (id, seals)
values (
  true,
  '[
    {"icon": "tested",   "title": "Produtos testados",     "description": "Cada item passa pela bancada antes de ser anunciado.", "link": null},
    {"icon": "reviews",  "title": "Reviews independentes", "description": "Prós e contras de verdade, nos vídeos do canal.",      "link": "/videos"},
    {"icon": "curation", "title": "Curadoria Sunano",      "description": "Selecionados e comparados pela equipe Sunano.",       "link": "/tierlist"},
    {"icon": "database", "title": "Database completo",     "description": "Specs e comparativos de cada periférico.",             "link": "/perifericos"}
  ]'::jsonb
)
on conflict (id) do nothing;
