-- Seção "Eventos" — campanhas que concedem medalhas automaticamente.
--
-- Reaproveita o catálogo de medalhas já existente (`medals`/`user_medals`,
-- ver 20260728_public_profile_showcase.sql) em vez de duplicar
-- nome/descrição/imagem: `events` só guarda os campos da campanha
-- (critério, contadores, datas) e referencia a medalha concedida.
--
-- Primeiro evento: "Pioneiro" para os primeiros 1000 usuários cadastrados.
-- A medalha `pioneiro` já existia no seed mas nunca era concedida a ninguém —
-- só atualizamos a descrição pra refletir o critério real do evento.

update public.medals
set description = 'Medalha recebida pelos primeiros 1000 usuários do site.'
where slug = 'pioneiro';

create table if not exists public.events (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  medal_id          uuid not null references public.medals(id) on delete restrict,
  criteria_type     text not null default 'first_n_signups'
                      check (criteria_type in ('first_n_signups')),
  max_participants  integer not null check (max_participants > 0),
  current_count     integer not null default 0 check (current_count >= 0),
  active            boolean not null default true,
  start_date        timestamptz not null default now(),
  end_date          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_events_active on public.events(active) where active;

alter table public.events enable row level security;

-- Catálogo de eventos é público (a página /eventos exibe até os encerrados).
drop policy if exists "Events are publicly readable" on public.events;
create policy "Events are publicly readable"
  on public.events for select using (true);

-- Sem policy de insert/update/delete: escrita só pelo service-role (API admin
-- + a função claim_event_medal abaixo), mesma postura de `medals`/`user_medals`.

-- ────────────────────────────────────────────
-- Concessão atômica da medalha do evento
--
-- Diferente de add_favorite_peripheral (20260728_atomic_favorite_like.sql),
-- que precisou de advisory lock por não ter uma linha única pra travar (era
-- um count(*) sobre várias linhas), aqui já existe a própria linha do evento:
-- um `select ... for update` nela serializa concorrência entre cadastros
-- simultâneos sem precisar de lock adicional.
-- ────────────────────────────────────────────
create or replace function public.claim_event_medal(p_event_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_medal_id uuid;
  v_max integer;
  v_count integer;
begin
  select medal_id, max_participants, current_count
    into v_medal_id, v_max, v_count
  from public.events
  where id = p_event_id and active = true
  for update;

  if not found or v_count >= v_max then
    return false;
  end if;

  insert into public.user_medals (user_id, medal_id)
  values (p_user_id, v_medal_id)
  on conflict (user_id, medal_id) do nothing;

  update public.events
  set current_count = current_count + 1,
      active = (current_count + 1 < v_max),
      end_date = case when current_count + 1 >= v_max then now() else end_date end,
      updated_at = now()
  where id = p_event_id;

  return true;
end;
$$;

-- Mesma postura de add_favorite_peripheral: SECURITY DEFINER e recebe o
-- user_id por parâmetro, então só o service-role (repositórios em
-- lib/server/**) pode chamá-la — exposta ao `authenticated` permitiria
-- reivindicar a medalha em nome de outro usuário.
revoke execute on function public.claim_event_medal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_event_medal(uuid, uuid) to service_role;

-- ────────────────────────────────────────────
-- Evento "Pioneiro" + backfill retroativo
--
-- "Primeiros 1000 usuários" vale desde sempre: soma quem já está cadastrado
-- hoje (pelos `created_at` mais antigos de `user_profiles`) e deixa o
-- contador pronto pra seguir contando os cadastros futuros a partir daí.
-- ────────────────────────────────────────────
do $$
declare
  v_medal_id uuid;
  v_event_id uuid;
  v_total bigint;
begin
  select id into v_medal_id from public.medals where slug = 'pioneiro';

  insert into public.events (slug, medal_id, criteria_type, max_participants, current_count, active)
  values ('pioneiro-1000', v_medal_id, 'first_n_signups', 1000, 0, true)
  on conflict (slug) do nothing
  returning id into v_event_id;

  if v_event_id is not null then
    insert into public.user_medals (user_id, medal_id)
    select id, v_medal_id
    from public.user_profiles
    order by created_at asc
    limit 1000
    on conflict (user_id, medal_id) do nothing;

    select count(*) into v_total from public.user_profiles;

    update public.events
    set current_count = least(v_total, 1000),
        active = least(v_total, 1000) < 1000
    where id = v_event_id;
  end if;
end $$;
