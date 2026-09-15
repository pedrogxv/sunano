-- Softwares: hub dos web softwares das marcas de periféricos (/softwares).
--
--   softwares               um card por marca: logo + link do Web Hub.
--   user_favorite_softwares favoritos do usuário. O limite (3 comum, 8 VIP)
--                           vive em lib/account-tier.ts e chega por parâmetro,
--                           mesma postura de add_favorite_peripheral.
--   software_clicks         no máximo um clique por visitante, software e dia.
--                           Base do bloco "Mais usados".
--
-- Nenhuma das três tem grant ou policy para anon/authenticated: leitura e
-- escrita passam pelas rotas do Next com service_role
-- (lib/server/repositories/softwares-repository.ts). RLS ligada e sem policy
-- deixa a REST sem enxergar nada.

create table if not exists public.softwares (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete restrict,
  logo_url    text not null,
  hub_url     text not null check (hub_url ~* '^https?://'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Um card por marca: o nome exibido é o da marca, então duas linhas da mesma
-- marca virariam dois cards idênticos na grade.
create unique index if not exists idx_softwares_brand_unique
  on public.softwares (brand_id);

create or replace function public.set_softwares_updated_at()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_softwares_updated_at on public.softwares;
create trigger trg_softwares_updated_at
  before update on public.softwares
  for each row execute function public.set_softwares_updated_at();

alter table public.softwares enable row level security;

create table if not exists public.user_favorite_softwares (
  user_id     uuid not null references auth.users(id) on delete cascade,
  software_id uuid not null references public.softwares(id) on delete cascade,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  primary key (user_id, software_id)
);

create index if not exists idx_user_favorite_softwares_user
  on public.user_favorite_softwares (user_id, position);

alter table public.user_favorite_softwares enable row level security;

-- `visitor_hash` é o hash salgado do IP (getClientIpIdentifier), nunca o IP.
-- A PK com o dia é o que impede um visitante de empurrar um software para o
-- topo clicando várias vezes.
create table if not exists public.software_clicks (
  software_id  uuid not null references public.softwares(id) on delete cascade,
  visitor_hash text not null,
  clicked_on   date not null default (now() at time zone 'America/Sao_Paulo')::date,
  primary key (software_id, visitor_hash, clicked_on)
);

create index if not exists idx_software_clicks_day
  on public.software_clicks (clicked_on, software_id);

alter table public.software_clicks enable row level security;

revoke all on public.softwares, public.user_favorite_softwares, public.software_clicks
  from anon, authenticated;

-- Favoritar com limite sem corrida: dois cliques simultâneos do mesmo usuário
-- não podem os dois passar pela contagem (ver 20260728000003).
create or replace function public.add_favorite_software(
  p_user_id uuid,
  p_software_id uuid,
  p_limit integer
)
returns text language plpgsql security definer
set search_path = public as $$
declare
  v_count integer;
  v_next_position smallint;
begin
  perform pg_advisory_xact_lock(hashtext('favorite_software:' || p_user_id::text));

  if exists (
    select 1 from public.user_favorite_softwares
    where user_id = p_user_id and software_id = p_software_id
  ) then
    return 'already_favorited';
  end if;

  select count(*) into v_count
  from public.user_favorite_softwares
  where user_id = p_user_id;

  if v_count >= p_limit then
    return 'limit_reached';
  end if;

  select coalesce(max(position), -1) + 1 into v_next_position
  from public.user_favorite_softwares
  where user_id = p_user_id;

  insert into public.user_favorite_softwares (user_id, software_id, position)
  values (p_user_id, p_software_id, v_next_position);

  return 'favorited';
end;
$$;

-- Recebe o user_id por parâmetro: exposta ao cliente, permitiria favoritar em
-- nome de outra pessoa.
revoke execute on function public.add_favorite_software(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.add_favorite_software(uuid, uuid, integer) to service_role;

-- Softwares mais clicados nos últimos `p_days` dias (fuso de São Paulo).
create or replace function public.software_click_ranking(p_days integer, p_limit integer)
returns table (software_id uuid, clicks bigint)
language sql stable
set search_path = public as $$
  select c.software_id, count(*) as clicks
  from public.software_clicks c
  where c.clicked_on > (now() at time zone 'America/Sao_Paulo')::date - greatest(p_days, 1)
  group by c.software_id
  order by count(*) desc, c.software_id
  limit greatest(p_limit, 0);
$$;

revoke execute on function public.software_click_ranking(integer, integer) from public, anon, authenticated;
grant execute on function public.software_click_ranking(integer, integer) to service_role;
