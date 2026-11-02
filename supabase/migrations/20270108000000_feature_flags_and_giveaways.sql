-- Feature flags + Sorteios.
--
-- FEATURE FLAGS
-- A DEFINIÇÃO de cada flag (nome, descrição, tipo, fallback) mora no código,
-- em `lib/feature-flags.ts`. O banco guarda só o ESTADO operacional que o
-- WEB MASTER muda pelo painel (/admin/feature-flags), sem deploy. Linha
-- ausente = fallback do código, que é sempre "off": flag nova nunca nasce
-- ligada por esquecimento de seed.
--
-- A avaliação (quem vê o quê) é feita no servidor, em TS, a partir desta
-- linha. O cliente recebe só a lista das flags LIGADAS para ele (no payload de
-- `/api/auth/me`), nunca a configuração: o nome de uma feature não lançada
-- não sai do servidor para quem não a vê.
--
-- Tudo passa pela rota com service_role (AGENTS.md, "cliente só lê conteúdo
-- público"): nenhuma das tabelas tem grant ou policy para anon/authenticated.

-- ---------------------------------------------------------------------------
-- 1. Estado das flags
-- ---------------------------------------------------------------------------
create table if not exists public.feature_flags (
  key             text primary key check (key ~ '^[a-z][a-z0-9_]{1,47}$'),
  -- off        : desligada para todo mundo (kill switch, vale sobre a allowlist)
  -- webmaster  : só WEB MASTER (+ allowlist)
  -- staff      : qualquer cargo do painel (+ allowlist)
  -- percentage : equipe + allowlist + X% dos usuários logados (bucket estável)
  -- everyone   : todo mundo, inclusive visitante sem conta
  mode            text not null default 'off'
                  check (mode in ('off', 'webmaster', 'staff', 'percentage', 'everyone')),
  rollout_percent smallint not null default 0 check (rollout_percent between 0 and 100),
  allow_user_ids  uuid[] not null default '{}' check (cardinality(allow_user_ids) <= 200),
  note            text check (note is null or char_length(note) <= 280),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);

alter table public.feature_flags enable row level security;
revoke all on table public.feature_flags from anon, authenticated;

comment on table public.feature_flags is
  'Estado operacional das feature flags. Definição no código (lib/feature-flags.ts); escrita só por /api/admin/feature-flags (WEB MASTER).';

-- ---------------------------------------------------------------------------
-- 2. Trilha de auditoria. Gravada por TRIGGER, não pela rota: nenhum caminho
--    de escrita (rota nova, script, SQL de emergência) muda uma flag sem
--    deixar o antes/depois e quem fez.
-- ---------------------------------------------------------------------------
create table if not exists public.feature_flag_events (
  id         bigint generated always as identity primary key,
  flag_key   text not null,
  actor_id   uuid references auth.users(id) on delete set null,
  before     jsonb,
  after      jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists feature_flag_events_flag_created_idx
  on public.feature_flag_events (flag_key, created_at desc);

alter table public.feature_flag_events enable row level security;
revoke all on table public.feature_flag_events from anon, authenticated;

create or replace function public.feature_flags_audit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_before jsonb;
  v_after  jsonb;
begin
  v_after := jsonb_build_object(
    'mode', new.mode,
    'rollout_percent', new.rollout_percent,
    'allow_user_ids', to_jsonb(new.allow_user_ids),
    'note', new.note
  );

  if tg_op = 'UPDATE' then
    v_before := jsonb_build_object(
      'mode', old.mode,
      'rollout_percent', old.rollout_percent,
      'allow_user_ids', to_jsonb(old.allow_user_ids),
      'note', old.note
    );
    -- Salvar sem mudar nada não vira linha no histórico.
    if v_before = v_after then
      return new;
    end if;
  end if;

  insert into public.feature_flag_events (flag_key, actor_id, before, after)
  values (new.key, new.updated_by, v_before, v_after);

  return new;
end;
$$;

revoke execute on function public.feature_flags_audit() from public, anon, authenticated;

drop trigger if exists trg_feature_flags_audit on public.feature_flags;
create trigger trg_feature_flags_audit
  after insert or update on public.feature_flags
  for each row execute function public.feature_flags_audit();

-- Sorteios nascem visíveis só para o WEB MASTER.
insert into public.feature_flags (key, mode, note)
values ('giveaways', 'webmaster', 'Lançamento: só WEB MASTER enquanto os primeiros sorteios são montados')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Sorteios
-- ---------------------------------------------------------------------------
create table if not exists public.giveaways (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(title) between 1 and 120),
  category         text not null check (category ~ '^[a-z_]{2,32}$'),
  -- rare = Raro (azul), special = Especial (vermelho), legendary = Lendário (amarelo)
  rarity           text not null check (rarity in ('rare', 'special', 'legendary')),
  -- Prêmio do catálogo (vínculo por id, nunca por nome) OU foto enviada.
  peripheral_id    uuid references public.peripherals(id) on delete set null,
  image_url        text check (image_url is null or char_length(image_url) <= 1024),
  max_participants integer not null check (max_participants between 1 and 100000),
  -- Mantido pelo trigger de giveaway_entries: a Home lê o contador sem contar
  -- linha a linha.
  entries_count    integer not null default 0 check (entries_count >= 0),
  status           text not null default 'draft' check (status in ('draft', 'open', 'closed', 'drawn')),
  ends_at          timestamptz,
  winner_user_id   uuid references auth.users(id) on delete set null,
  drawn_at         timestamptz,
  sort_order       integer not null default 0,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists giveaways_status_order_idx
  on public.giveaways (status, sort_order, created_at desc);

alter table public.giveaways enable row level security;
revoke all on table public.giveaways from anon, authenticated;

create table if not exists public.giveaway_entries (
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (giveaway_id, user_id)
);

create index if not exists giveaway_entries_user_idx on public.giveaway_entries (user_id);

alter table public.giveaway_entries enable row level security;
revoke all on table public.giveaway_entries from anon, authenticated;

comment on table public.giveaways is
  'Sorteios da Home. Escrita só por /api/admin/giveaways (WEB MASTER); leitura pela rota /api/giveaways, atrás da flag `giveaways`.';
comment on table public.giveaway_entries is
  'Uma participação por pessoa por sorteio. Gravada só por join_giveaway (trava a linha do sorteio).';

-- Contador. Cobre também a remoção em cascata (conta apagada).
create or replace function public.giveaway_entries_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.giveaways set entries_count = entries_count + 1 where id = new.giveaway_id;
    return new;
  end if;
  update public.giveaways set entries_count = greatest(entries_count - 1, 0) where id = old.giveaway_id;
  return old;
end;
$$;

revoke execute on function public.giveaway_entries_count() from public, anon, authenticated;

drop trigger if exists trg_giveaway_entries_count on public.giveaway_entries;
create trigger trg_giveaway_entries_count
  after insert or delete on public.giveaway_entries
  for each row execute function public.giveaway_entries_count();

-- ---------------------------------------------------------------------------
-- 4. Participar. A linha do sorteio é travada (FOR UPDATE) antes de conferir
--    a vaga: duas pessoas disputando a última vaga não passam as duas, o
--    mesmo cuidado do estoque da Loja.
-- ---------------------------------------------------------------------------
create or replace function public.join_giveaway(p_giveaway_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_g public.giveaways%rowtype;
  v_inserted integer;
begin
  select * into v_g from public.giveaways where id = p_giveaway_id for update;

  if not found or v_g.status = 'draft' then
    return jsonb_build_object('code', 'not_found');
  end if;

  if exists (select 1 from public.giveaway_entries where giveaway_id = p_giveaway_id and user_id = p_user_id) then
    return jsonb_build_object('code', 'already', 'entries_count', v_g.entries_count);
  end if;

  if v_g.status <> 'open' or (v_g.ends_at is not null and v_g.ends_at <= now()) then
    return jsonb_build_object('code', 'closed', 'entries_count', v_g.entries_count);
  end if;

  if v_g.entries_count >= v_g.max_participants then
    return jsonb_build_object('code', 'full', 'entries_count', v_g.entries_count);
  end if;

  insert into public.giveaway_entries (giveaway_id, user_id)
  values (p_giveaway_id, p_user_id)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'code', case when v_inserted = 1 then 'joined' else 'already' end,
    'entries_count', v_g.entries_count + v_inserted
  );
end;
$$;

revoke execute on function public.join_giveaway(uuid, uuid) from public, anon, authenticated;
grant execute on function public.join_giveaway(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Sortear. `gen_random_uuid()` sai do gerador forte do Postgres
--    (pg_strong_random); `random()` não é próprio para escolher ganhador.
--    Resultado final: um sorteio já sorteado não é refeito por esta função.
-- ---------------------------------------------------------------------------
create or replace function public.draw_giveaway(p_giveaway_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_g public.giveaways%rowtype;
  v_winner uuid;
begin
  select * into v_g from public.giveaways where id = p_giveaway_id for update;

  if not found then
    return jsonb_build_object('code', 'not_found');
  end if;
  if v_g.status = 'drawn' then
    return jsonb_build_object('code', 'already_drawn', 'winner_user_id', v_g.winner_user_id);
  end if;
  if v_g.status = 'draft' then
    return jsonb_build_object('code', 'draft');
  end if;

  select user_id into v_winner
  from public.giveaway_entries
  where giveaway_id = p_giveaway_id
  order by gen_random_uuid()
  limit 1;

  if v_winner is null then
    return jsonb_build_object('code', 'no_entries');
  end if;

  update public.giveaways
  set status = 'drawn', winner_user_id = v_winner, drawn_at = now(), updated_at = now()
  where id = p_giveaway_id;

  return jsonb_build_object('code', 'drawn', 'winner_user_id', v_winner);
end;
$$;

revoke execute on function public.draw_giveaway(uuid) from public, anon, authenticated;
grant execute on function public.draw_giveaway(uuid) to service_role;
