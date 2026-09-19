-- Flags de segurança do Trust Factor (§9 do documento).
--
-- POR QUE UMA TABELA, E NÃO UM ARRAY EM user_profiles
-- ---------------------------------------------------
-- Uma flag não é um booleano: ela tem QUEM levantou, QUANDO, POR QUÊ e quando
-- foi resolvida. Um `text[]` na coluna do perfil responde só "está levantada
-- agora" e joga fora exatamente o que a moderação precisa quando alguém
-- contesta ("por que minha conta está em análise?"). A tabela também permite
-- a mesma flag ser levantada, resolvida e levantada de novo sem perder o
-- histórico.
--
-- O PONTO CENTRAL: "uma flag pode bloquear funções específicas mesmo que a
-- pontuação ainda esteja alta". Por isso o bloqueio NÃO é uma comparação de
-- nota — quem bloqueia é a flag ativa, por meio de `trust_status`.

create table if not exists public.trust_flags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  flag        text not null,
  reason      text,
  -- Quem levantou: `null` quando foi detecção automática (o cron de padrões
  -- suspeitos), preenchido quando foi decisão de uma pessoa da equipe.
  raised_by   uuid references public.user_profiles(id) on delete set null,
  raised_at   timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.user_profiles(id) on delete set null,
  resolution  text,
  metadata    jsonb not null default '{}'::jsonb
);

alter table public.trust_flags
  drop constraint if exists trust_flags_flag_check;
alter table public.trust_flags
  add constraint trust_flags_flag_check
  check (flag in (
    'AURA_FARMING', 'MULTI_ACCOUNT', 'SPAM',
    'FRAUD_SUSPECTED', 'TESTER_DISPUTE', 'IDENTITY_REVIEW'
  ));

-- Uma flag do mesmo tipo só pode estar ATIVA uma vez por conta. Levantar de
-- novo enquanto a anterior está aberta é no-op, não uma segunda linha —
-- senão o cron de detecção criaria uma flag por execução.
create unique index if not exists uq_trust_flags_active
  on public.trust_flags (user_id, flag)
  where resolved_at is null;

create index if not exists idx_trust_flags_user
  on public.trust_flags (user_id, raised_at desc);

-- Fila do painel: as abertas, mais recentes primeiro.
create index if not exists idx_trust_flags_open
  on public.trust_flags (raised_at desc)
  where resolved_at is null;

comment on table public.trust_flags is
  'Flags de segurança do Trust Factor. Uma flag ativa pode bloquear funções mesmo com pontuação alta.';

alter table public.trust_flags enable row level security;

-- ────────────────────────────────────────────
-- raise_trust_flag — levantar (idempotente)
-- ────────────────────────────────────────────
-- Não mexe na PONTUAÇÃO: flag e nota são eixos separados. O que ela faz é
-- empurrar o `trust_status`, que é o que de fato bloqueia função. As flags de
-- fraude/identidade restringem; as demais só colocam em observação.
create or replace function public.raise_trust_flag(
  p_user_id   uuid,
  p_flag      text,
  p_reason    text default null,
  p_raised_by uuid default null,
  p_metadata  jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer
set search_path = public as $$
declare
  v_id     uuid;
  v_status text;
begin
  insert into public.trust_flags (user_id, flag, reason, raised_by, metadata)
  values (p_user_id, p_flag, p_reason, p_raised_by, coalesce(p_metadata, '{}'::jsonb))
  on conflict do nothing
  returning id into v_id;

  -- Já havia uma ativa: nada a fazer, devolve a existente.
  if v_id is null then
    select id into v_id
    from public.trust_flags
    where user_id = p_user_id and flag = p_flag and resolved_at is null;
    return v_id;
  end if;

  select trust_status into v_status from public.user_profiles where id = p_user_id;

  -- Conta já bloqueada não é rebaixada nem promovida por uma flag nova.
  if v_status = 'blocked' then
    return v_id;
  end if;

  if p_flag in ('FRAUD_SUSPECTED', 'MULTI_ACCOUNT', 'IDENTITY_REVIEW') then
    perform public.set_trust_status(p_user_id, 'restricted', p_reason, p_raised_by);
  elsif v_status = 'active' then
    perform public.set_trust_status(p_user_id, 'watch', p_reason, p_raised_by);
  end if;

  return v_id;
end;
$$;

revoke execute on function public.raise_trust_flag(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.raise_trust_flag(uuid, text, text, uuid, jsonb) to service_role;

-- ────────────────────────────────────────────
-- resolve_trust_flag — baixar
-- ────────────────────────────────────────────
-- Devolve a conta para 'active' SÓ quando não sobra nenhuma outra flag aberta.
-- Sem essa checagem, baixar a flag de spam devolveria o acesso de quem ainda
-- está com fraude em análise.
--
-- Conta 'blocked' NÃO volta sozinha: fraude crítica exige decisão explícita
-- (`set_trust_status`), nunca o efeito colateral de arquivar uma flag.
create or replace function public.resolve_trust_flag(
  p_flag_id     uuid,
  p_resolved_by uuid default null,
  p_resolution  text default null
) returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_user_id uuid;
  v_status  text;
  v_open    integer;
begin
  update public.trust_flags
    set resolved_at = now(),
        resolved_by = p_resolved_by,
        resolution  = p_resolution
    where id = p_flag_id and resolved_at is null
    returning user_id into v_user_id;

  if v_user_id is null then
    return;
  end if;

  select trust_status into v_status from public.user_profiles where id = v_user_id;
  if v_status = 'blocked' then
    return;
  end if;

  select count(*) into v_open
  from public.trust_flags
  where user_id = v_user_id and resolved_at is null;

  if v_open = 0 then
    perform public.set_trust_status(v_user_id, 'active', p_resolution, p_resolved_by);
  end if;
end;
$$;

revoke execute on function public.resolve_trust_flag(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.resolve_trust_flag(uuid, uuid, text) to service_role;
