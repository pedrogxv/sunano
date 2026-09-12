-- Categorias hierárquicas do fórum (categoria > subcategoria).
--
-- Substitui o `peripheral_refs uuid[]` como forma de classificar um post —
-- em vez de vincular periféricos específicos, o post passa a pertencer a
-- uma categoria (ex: "Teclado") e, opcionalmente, uma subcategoria dela
-- (ex: "Magnético"). Tabela própria do fórum, não reaproveita
-- `peripherals.category`/`tags`, para poder ter subcategorias livres sem
-- mexer no catálogo de produtos.

create table if not exists public.forum_categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.forum_categories(id) on delete restrict,
  slug        text not null,
  name        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (parent_id, slug)
);

-- `unique(parent_id, slug)` não protege as raízes entre si — `parent_id`
-- nulo é sempre "distinto" de outro nulo para o Postgres. Índice parcial
-- cobre a unicidade de slug só entre as raízes.
create unique index if not exists idx_forum_categories_root_slug
  on public.forum_categories (slug) where parent_id is null;

create index if not exists idx_forum_categories_parent
  on public.forum_categories (parent_id, sort_order);

-- Limita a hierarquia a 2 níveis (categoria > subcategoria). Validado aqui
-- (não só na UI) para não depender do client se comportar.
create or replace function public.forum_categories_check_depth()
returns trigger language plpgsql as $$
declare
  v_grandparent uuid;
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'forum_categories: uma categoria não pode ser sua própria categoria-mãe';
    end if;
    select parent_id into v_grandparent from public.forum_categories where id = new.parent_id;
    if v_grandparent is not null then
      raise exception 'forum_categories: máximo de 2 níveis (categoria > subcategoria)';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_forum_categories_check_depth on public.forum_categories;
create trigger trg_forum_categories_check_depth
  before insert or update on public.forum_categories
  for each row execute function public.forum_categories_check_depth();

create or replace function public.set_forum_categories_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_forum_categories_updated_at on public.forum_categories;
create trigger trg_forum_categories_updated_at
  before update on public.forum_categories
  for each row execute function public.set_forum_categories_updated_at();

alter table public.forum_categories enable row level security;

drop policy if exists "Forum categories are publicly readable" on public.forum_categories;
create policy "Forum categories are publicly readable"
  on public.forum_categories for select using (is_active = true);

-- Sem policy de insert/update/delete: escrita só pelo service-role (repositório
-- admin em lib/server/repositories/forum-categories-repository.ts), mesma
-- postura de `medals`/`events`.

-- Seed: 13 categorias-raiz — as 12 de `peripherals.category` + "geral" como
-- catch-all (posts sem periférico específico, e fallback da migração de
-- posts antigos em 20260807_forum_posts_restructure.sql).
insert into public.forum_categories (slug, name, sort_order) values
  ('geral',     'Geral',        0),
  ('mouse',     'Mouse',        1),
  ('keyboard',  'Teclado',      2),
  ('pcb',       'PCB',          3),
  ('mousepad',  'Mousepad',     4),
  ('glasspad',  'Glasspad',     5),
  ('iem',       'IEM',          6),
  ('headset',   'Headset',      7),
  ('feet',      'Feet/Skates',  8),
  ('chairs',    'Cadeiras',     9),
  ('monitors',  'Monitores',   10),
  ('switches',  'Switches',    11),
  ('dac_amp',   'DAC/Amp',     12)
on conflict do nothing;

-- Exemplos de subcategoria — o admin cria o restante pela tela nova.
insert into public.forum_categories (parent_id, slug, name, sort_order)
select id, 'magnetico', 'Magnético', 0
from public.forum_categories where slug = 'keyboard' and parent_id is null
on conflict (parent_id, slug) do nothing;

insert into public.forum_categories (parent_id, slug, name, sort_order)
select id, 'wireless', 'Wireless', 0
from public.forum_categories where slug = 'mouse' and parent_id is null
on conflict (parent_id, slug) do nothing;
