-- Migração de `peripherals.brand` (texto livre) para uma tabela relacional
-- `brands`, com `peripherals.brand_id` (FK). Elimina duplicatas por
-- grafia/capitalização e habilita CRUD de marcas no admin.
--
-- IMPORTANTE — aplicar manualmente via Supabase Dashboard (SQL Editor) em
-- DUAS etapas, com checkpoint humano no meio (não rodar via `supabase db push`,
-- o histórico de migrations deste projeto está dessincronizado desde 04/08).
--
-- Antes de rodar o BLOCO A, audite os dados existentes rodando:
--   select distinct brand, count(*) from peripherals group by brand order by brand;
-- e corrija manualmente eventuais typos/grafias divergentes em `peripherals.brand`
-- (ex.: "Redragon" vs "Reddragon") — o backfill abaixo só deduplica por
-- igualdade exata (case/espaço insensitive), não detecta erros de digitação.

-- ============================================================================
-- BLOCO A — schema + seed + backfill (não destrutivo, não apaga nada)
-- ============================================================================

create table if not exists public.brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists idx_brands_name_unique
  on public.brands (lower(trim(name)));

create or replace function public.set_brands_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_brands_updated_at on public.brands;
create trigger trg_brands_updated_at
  before update on public.brands
  for each row execute function public.set_brands_updated_at();

alter table public.brands enable row level security;

drop policy if exists "Brands are publicly readable" on public.brands;
create policy "Brands are publicly readable"
  on public.brands for select using (true);
-- Sem policies de insert/update/delete: escrita só pelo service role
-- (lib/server/repositories/brands-repository.ts), mesma postura de outras
-- tabelas administradas pelo admin (ex.: forum_categories).

-- Seed: marcas já em uso em peripherals.brand (preserva a grafia da
-- primeira ocorrência por nome normalizado).
insert into public.brands (name)
select distinct on (lower(trim(brand))) trim(brand)
from public.peripherals
where brand is not null and trim(brand) <> ''
order by lower(trim(brand)), brand
on conflict (lower(trim(name))) do nothing;

-- Seed: marcas sugeridas no combobox do admin (BRAND_OPTIONS em
-- app/admin/tierlist/form.tsx) que ainda não estejam em uso — mantém o
-- combobox "rico" desde o primeiro dia, sem exigir recadastro manual.
insert into public.brands (name) values
  ('Aeperion'),
  ('AIM1'),
  ('Aimstar'),
  ('Alienware'),
  ('Ajazz'),
  ('Akko'),
  ('Amicis'),
  ('AOC'),
  ('Angry Miao'),
  ('ANTGAMER'),
  ('Apple'),
  ('Arbiter Studio'),
  ('Artisan'),
  ('Asus'),
  ('Asus Rog'),
  ('ATK'),
  ('Attack Shark'),
  ('Aula'),
  ('Ausdom'),
  ('Audeze'),
  ('Audio-Technica'),
  ('BenQ'),
  ('Beyerdynamic'),
  ('Black Canyon'),
  ('Carotmas'),
  ('Cooler Master'),
  ('Corsair'),
  ('CRDRACO'),
  ('DareU'),
  ('DARMOSHARK'),
  ('Dell'),
  ('D-Glow'),
  ('DR.Office'),
  ('Dornfinger'),
  ('DrunkDeer'),
  ('Ducky'),
  ('Dunu'),
  ('Endgame Gear'),
  ('Epomaker'),
  ('EspTiger'),
  ('Everglide'),
  ('EWEADN'),
  ('Fantech'),
  ('Philco'),
  ('Finalmouse'),
  ('FL Sports'),
  ('Flydigi'),
  ('FreeFall'),
  ('FuryCube'),
  ('Gamemax'),
  ('Gateron'),
  ('GK'),
  ('GLSSWRKS'),
  ('Glorious'),
  ('Gravastar'),
  ('G-Wolves'),
  ('Hator'),
  ('Huano'),
  ('HyperX'),
  ('Hystar'),
  ('IceSoul'),
  ('INCOTT'),
  ('INZONE'),
  ('IQUNIX'),
  ('IROK'),
  ('Ipi'),
  ('Kailh'),
  ('Kanami'),
  ('Kefine'),
  ('Keychron'),
  ('Keyverse'),
  ('Kibu'),
  ('Kinera'),
  ('KingJade'),
  ('Kiwi Ears'),
  ('Kurosun'),
  ('Kysona'),
  ('Lamzu'),
  ('Leobog'),
  ('Leopold'),
  ('Lethal Gaming Gear'),
  ('Lian Li'),
  ('LG'),
  ('Linsoul'),
  ('Lock-On'),
  ('Logitech'),
  ('Luvinco'),
  ('M.E.T.A'),
  ('Mad Catz'),
  ('Madlions'),
  ('Mchose'),
  ('Mechlands'),
  ('MEETKB'),
  ('Melgeek'),
  ('Meow Gaming Gear'),
  ('MIKIT'),
  ('MM Studios'),
  ('Mojak Hub'),
  ('Morkblade'),
  ('Msi'),
  ('Nexus'),
  ('NINJUTSO'),
  ('Nollie'),
  ('Nuphy'),
  ('NZXT'),
  ('Odin Gaming'),
  ('Outemu'),
  ('Phantum'),
  ('Pulsar'),
  ('PWNAGE'),
  ('Rakka'),
  ('Rapoo'),
  ('Rawn'),
  ('Razer'),
  ('Reddragon'),
  ('Roccat'),
  ('Samsung'),
  ('Scyrox'),
  ('Sennheiser'),
  ('SensoryBoost'),
  ('SkyPad'),
  ('Souleels'),
  ('SteelSeries'),
  ('Superbeings Lab'),
  ('SuperFrame'),
  ('Teevolution'),
  ('Tekkusai'),
  ('Tenta-X'),
  ('TITAN'),
  ('Titorion'),
  ('TTC'),
  ('Valkyrie'),
  ('VANCER'),
  ('Varmilo'),
  ('VGN'),
  ('VTER'),
  ('VXE'),
  ('Waizowl'),
  ('Wallhack'),
  ('Wob'),
  ('Wooting'),
  ('Wraith'),
  ('WuQue Studios'),
  ('Xiaomi'),
  ('X-Raypad'),
  ('Xtrfy'),
  ('Yuki Aim'),
  ('zaopin'),
  ('Zirnex'),
  ('Zowie'),
  ('WLMouse')
on conflict (lower(trim(name))) do nothing;

alter table public.peripherals
  add column if not exists brand_id uuid references public.brands(id) on delete restrict;

-- Backfill: casa peripherals.brand (texto livre) com brands.name por
-- comparação normalizada (trim + case-insensitive).
update public.peripherals p
set brand_id = b.id
from public.brands b
where lower(trim(p.brand)) = lower(trim(b.name))
  and p.brand_id is null;

-- >>> CHECKPOINT MANUAL — rode antes de prosseguir para o BLOCO B:
--   select count(*) from peripherals where brand_id is null;
-- Deve retornar 0. Se não retornar, NÃO rode o bloco B — investigue os
-- registros pendentes (provavelmente `brand` nulo/vazio na origem).

-- ============================================================================
-- BLOCO B — trava NOT NULL e dropa a coluna antiga (destrutivo).
-- Só rodar depois de confirmar o checkpoint acima.
-- ============================================================================

do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing from public.peripherals where brand_id is null;
  if v_missing > 0 then
    raise exception 'brands migration: % periféricos ficaram sem brand_id após o backfill', v_missing;
  end if;
end $$;

alter table public.peripherals alter column brand_id set not null;

create index if not exists idx_peripherals_brand_id on public.peripherals (brand_id);

-- alter table public.peripherals drop column if exists brand; 
