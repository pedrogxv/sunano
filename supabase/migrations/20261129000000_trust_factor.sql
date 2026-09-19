-- Trust Factor — pontuação global de confiança da conta (0–100).
--
-- O QUE É
-- -------
-- Aura mede PARTICIPAÇÃO e progressão. Trust Factor mede COMPORTAMENTO,
-- integridade e confiança. São eixos independentes de propósito: farmar Aura
-- não compra confiança, e uma conta impecável que nunca postou não tem Aura.
--
-- Toda conta começa em 50 ("sem histórico suficiente para ser confiável ou
-- problemático"). O usuário vê só a FAIXA (Baixo/Regular/Bom/Muito Bom/
-- Excelente); a pontuação exata, os pesos e as regras ficam internos, para
-- reduzir manipulação.
--
-- O QUE ESTA MIGRATION SUBSTITUI
-- -------------------------------
-- O trust tier de 3 níveis ('new'/'normal'/'verified',
-- 20260923000002 + 20261024000000) era um proxy grosseiro de confiança: idade
-- da conta + um sinal social (Discord/YouTube) + VIP. Ele respondia "essa
-- conta é descartável?" mas não "essa pessoa se comporta bem?" — um membro de
-- 2 anos com três suspensões era 'verified' igual a um membro exemplar.
-- `get_giver_trust_tier` e `get_aura_trust_limits` continuam existindo (as 3
-- RPCs de toggle chamam elas, e não são reescritas aqui), mas passam a derivar
-- do Trust Factor, não mais de idade+social. É o único lugar onde os dois
-- sistemas se encostam.
--
-- POR QUE A PONTUAÇÃO É DERIVADA, E NÃO ACUMULADA
-- ------------------------------------------------
-- `trust_score` NÃO é um contador que se soma e subtrai a cada evento. Ele é
-- RECALCULADO a partir de `trust_events` (a base 50, mais a soma dos eventos
-- com o peso já decaído pela recuperação, mais o teto de maturidade). Somar
-- in-place parece mais simples e é a porta de dois bugs que não dá para
-- consertar depois: (a) recuperação de penalidade exigiria saber quanto cada
-- evento antigo ainda pesa — informação que o acumulador jogou fora; (b) um
-- evento aplicado duas vezes (retry de rota, duplo clique) fica gravado no
-- saldo para sempre, sem como auditar. Derivar de `trust_events` faz o extrato
-- ser a verdade e a coluna ser só um cache consultável/indexável.

-- ────────────────────────────────────────────
-- 1. Colunas em user_profiles
-- ────────────────────────────────────────────
-- `trust_score` e `trust_level` são cache derivado de `trust_events`
-- (recalculados por `recalc_trust_score`), para que listagem e gate de
-- resgate não precisem somar o extrato inteiro a cada leitura.
--
-- `trust_status` é o estado administrativo da conta, independente da nota:
--   'active'    — normal;
--   'watch'     — sob observação (não bloqueia nada por si, sinaliza no admin);
--   'restricted'— perde funções de risco mesmo com nota alta;
--   'blocked'   — fraude crítica; Trust 0 e sem recuperação automática.
alter table public.user_profiles
  add column if not exists trust_score integer not null default 50,
  add column if not exists trust_level text not null default 'regular',
  add column if not exists trust_status text not null default 'active',
  add column if not exists trust_updated_at timestamptz not null default now();

alter table public.user_profiles
  drop constraint if exists user_profiles_trust_score_check;
alter table public.user_profiles
  add constraint user_profiles_trust_score_check
  check (trust_score between 0 and 100);

alter table public.user_profiles
  drop constraint if exists user_profiles_trust_level_check;
alter table public.user_profiles
  add constraint user_profiles_trust_level_check
  check (trust_level in ('low', 'regular', 'good', 'very_good', 'excellent'));

alter table public.user_profiles
  drop constraint if exists user_profiles_trust_status_check;
alter table public.user_profiles
  add constraint user_profiles_trust_status_check
  check (trust_status in ('active', 'watch', 'restricted', 'blocked'));

comment on column public.user_profiles.trust_score is
  'Trust Factor 0-100, CACHE derivado de trust_events por recalc_trust_score(). Nunca escrever direto.';
comment on column public.user_profiles.trust_level is
  'Faixa pública do Trust Factor. Derivada de trust_score por trust_level_of().';
comment on column public.user_profiles.trust_status is
  'Estado administrativo: active | watch | restricted | blocked. Independente da nota.';

-- Gate de resgate e painel filtram por nota/estado; a maioria das contas fica
-- em 'active', então o índice parcial de status fica pequeno.
create index if not exists idx_user_profiles_trust_score
  on public.user_profiles (trust_score);
create index if not exists idx_user_profiles_trust_status
  on public.user_profiles (trust_status)
  where trust_status <> 'active';

-- ────────────────────────────────────────────
-- 2. trust_events — o extrato
-- ────────────────────────────────────────────
-- Fonte da verdade. `points` é o impacto BRUTO do evento (positivo ou
-- negativo); quanto dele ainda vale hoje é decidido na leitura, pela
-- `severity` + idade (ver `trust_event_weight`).
--
-- `severity` governa a RECUPERAÇÃO, não o tamanho do impacto:
--   'positive' — ganho legítimo, não decai (o teto diário já o limita);
--   'light'    — começa a perder peso após 30 dias;
--   'medium'   — recuperação em ~90 dias;
--   'heavy'    — 180 dias;
--   'critical' — nunca decai; sem recuperação automática.
create table if not exists public.trust_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  event_type  text not null,
  points      integer not null,
  severity    text not null default 'light',
  reason      text,
  source      text not null default 'system',
  -- Chave de deduplicação opcional: quando presente, o mesmo evento não entra
  -- duas vezes (retry de rota, duplo clique, reprocessamento do cron). É o que
  -- torna `apply_trust_event` seguro de chamar mais de uma vez.
  dedupe_key  text,
  actor_id    uuid references public.user_profiles(id) on delete set null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table public.trust_events
  drop constraint if exists trust_events_severity_check;
alter table public.trust_events
  add constraint trust_events_severity_check
  check (severity in ('positive', 'light', 'medium', 'heavy', 'critical'));

alter table public.trust_events
  drop constraint if exists trust_events_source_check;
alter table public.trust_events
  add constraint trust_events_source_check
  check (source in ('system', 'moderation', 'admin', 'tester', 'cron', 'security'));

-- Extrato por usuário, mais recente primeiro (painel e recálculo).
create index if not exists idx_trust_events_user_created
  on public.trust_events (user_id, created_at desc);

-- Dedupe global: um `dedupe_key` preenchido só pode existir uma vez.
create unique index if not exists uq_trust_events_dedupe
  on public.trust_events (dedupe_key)
  where dedupe_key is not null;

-- Teto diário de ganho: conta quantos pontos positivos o usuário somou hoje.
create index if not exists idx_trust_events_user_positive_day
  on public.trust_events (user_id, created_at)
  where points > 0;

comment on table public.trust_events is
  'Extrato do Trust Factor. Fonte da verdade — user_profiles.trust_score é cache derivado daqui.';

-- Cliente não lê nem escreve: Trust é dado interno (a pontuação exata não é
-- pública, só a faixa). Tudo passa por rota com service_role.
alter table public.trust_events enable row level security;

-- ────────────────────────────────────────────
-- 3. Faixas — um lugar só
-- ────────────────────────────────────────────
-- Espelha TRUST_LEVELS em lib/trust-factor.ts. Mudar um exige mudar o outro;
-- o do banco é o que vale (é ele que grava `trust_level`).
create or replace function public.trust_level_of(p_score integer)
returns text language sql immutable as $$
  select case
    when p_score >= 90 then 'excellent'
    when p_score >= 80 then 'very_good'
    when p_score >= 60 then 'good'
    when p_score >= 40 then 'regular'
    else 'low'
  end;
$$;

comment on function public.trust_level_of(integer) is
  'Faixa pública a partir da nota. Espelha TRUST_LEVELS em lib/trust-factor.ts.';

-- ────────────────────────────────────────────
-- 4. Teto de maturidade
-- ────────────────────────────────────────────
-- Impede que conta nova alcance reputação máxima rapidamente. É um TETO, não
-- uma penalidade: não tira pontos, só limita o quanto a soma pode subir. Uma
-- conta de 2 dias com histórico impecável fica em 59 e sobe sozinha ao passar
-- dos 7 dias, sem evento nenhum.
create or replace function public.trust_maturity_cap(p_created_at timestamptz)
returns integer language sql immutable as $$
  select case
    when p_created_at is null then 59
    when p_created_at > now() - interval '7 days'  then 59
    when p_created_at > now() - interval '30 days' then 69
    when p_created_at > now() - interval '90 days' then 79
    else 100
  end;
$$;

comment on function public.trust_maturity_cap(timestamptz) is
  'Teto temporário por idade de conta: 59 / 69 / 79 / 100. Espelha TRUST_MATURITY_CAPS em lib/trust-factor.ts.';

-- ────────────────────────────────────────────
-- 5. Recuperação — quanto de um evento ainda pesa
-- ────────────────────────────────────────────
-- A penalidade não é apagada do extrato: ela perde PESO com o tempo, em rampa
-- linear. Apagar a linha destruiria o histórico que a moderação precisa ler;
-- zerar o peso de uma vez faria a nota dar um salto inexplicável num dia
-- arbitrário. A rampa também é o que faz a rotina diária ter o que processar.
--
-- Positivo nunca decai (o teto de +3/dia já limita o acúmulo). Crítico nunca
-- decai (sem recuperação automática — só análise manual, que remove o evento).
-- A conta é feita em DIAS (numeric), não dividindo intervalos: Postgres não
-- tem operador `interval / interval`, e a versão com intervalos falhava já no
-- `create function`.
--
-- Janela de recuperação por severidade, contada DEPOIS dos 30 dias de carência:
--   leve   — 60 dias  (some por volta dos 90 dias de idade)
--   média  — 90 dias  (some por volta dos 120)
--   grave  — 180 dias (some por volta dos 210)
create or replace function public.trust_event_weight(
  p_points     integer,
  p_severity   text,
  p_created_at timestamptz
) returns numeric language sql immutable as $$
  select case
    when p_severity in ('positive', 'critical') then p_points::numeric
    else p_points::numeric * greatest(
      0::numeric,
      least(
        1::numeric,
        -- Fração do peso que ainda resta: 1.0 durante os 30 dias de carência,
        -- caindo linearmente até 0 no fim da janela da severidade.
        (
          case p_severity
            when 'light'  then 60::numeric
            when 'medium' then 90::numeric
            when 'heavy'  then 180::numeric
            else 1::numeric
          end
          - greatest(
              extract(epoch from (now() - p_created_at)) / 86400.0 - 30::numeric,
              0::numeric
            )
        ) / case p_severity
              when 'light'  then 60::numeric
              when 'medium' then 90::numeric
              when 'heavy'  then 180::numeric
              else 1::numeric
            end
      )
    )
  end;
$$;

comment on function public.trust_event_weight(integer, text, timestamptz) is
  'Quanto de um evento ainda pesa hoje. Penalidade decai em rampa linear após 30 dias; positivo e crítico não decaem.';

-- ────────────────────────────────────────────
-- 6. recalc_trust_score — o único lugar que escreve a nota
-- ────────────────────────────────────────────
-- base 50 + soma dos eventos com peso decaído, limitado a [0,100] e ao teto de
-- maturidade. Conta 'blocked' é 0 e não recalcula: fraude crítica não se
-- recupera sozinha, e sem esse ramo o decaimento devolveria pontos com o tempo.
create or replace function public.recalc_trust_score(p_user_id uuid)
returns integer
language plpgsql security definer
set search_path = public as $$
declare
  v_created_at timestamptz;
  v_status     text;
  v_sum        numeric;
  v_cap        integer;
  v_score      integer;
begin
  select created_at, trust_status into v_created_at, v_status
  from public.user_profiles
  where id = p_user_id;

  if not found then
    return null;
  end if;

  if v_status = 'blocked' then
    update public.user_profiles
      set trust_score = 0, trust_level = 'low', trust_updated_at = now()
      where id = p_user_id;
    return 0;
  end if;

  select coalesce(sum(public.trust_event_weight(points, severity, created_at)), 0)
    into v_sum
  from public.trust_events
  where user_id = p_user_id;

  v_cap := public.trust_maturity_cap(v_created_at);

  -- O teto de maturidade limita só o LADO POSITIVO: uma conta nova pode cair
  -- abaixo de 59 por penalidade, mas não pode passar dele por bom
  -- comportamento.
  v_score := greatest(0, least(100, round(50 + v_sum)::integer));
  v_score := least(v_score, v_cap);

  update public.user_profiles
    set trust_score = v_score,
        trust_level = public.trust_level_of(v_score),
        trust_updated_at = now()
    where id = p_user_id;

  return v_score;
end;
$$;

revoke execute on function public.recalc_trust_score(uuid) from public, anon, authenticated;
grant execute on function public.recalc_trust_score(uuid) to service_role;

-- ────────────────────────────────────────────
-- 7. apply_trust_event — o único caminho de entrada
-- ────────────────────────────────────────────
-- Grava o evento e recalcula na mesma transação. Toda integração (moderação,
-- reviews, Aura, comunidade, Tester) passa por aqui — é o que garante que a
-- nota nunca fique dessincronizada do extrato.
--
-- TETO DIÁRIO DE GANHO: atividade normal rende no máximo +3 por dia. O evento
-- positivo que ultrapassa o teto é gravado com os pontos APARADOS (podendo
-- virar 0), não descartado: descartar perderia o registro de que a pessoa fez
-- a coisa certa, e é o registro que a moderação lê. Penalidade não respeita
-- teto — uma fraude de -40 entra inteira no mesmo dia.
create or replace function public.apply_trust_event(
  p_user_id    uuid,
  p_event_type text,
  p_points     integer,
  p_severity   text default 'light',
  p_reason     text default null,
  p_source     text default 'system',
  p_dedupe_key text default null,
  p_actor_id   uuid default null,
  p_metadata   jsonb default '{}'::jsonb
) returns integer
language plpgsql security definer
set search_path = public as $$
declare
  v_points     integer := p_points;
  v_gained     integer;
  v_daily_cap  constant integer := 3;
  v_exists     boolean;
begin
  if not exists (select 1 from public.user_profiles where id = p_user_id) then
    return null;
  end if;

  -- Dedupe: mesma chave não entra duas vezes. Devolve a nota atual, sem
  -- gravar nada, para que a rota chamadora não precise distinguir o caso.
  if p_dedupe_key is not null then
    select exists(select 1 from public.trust_events where dedupe_key = p_dedupe_key)
      into v_exists;
    if v_exists then
      return (select trust_score from public.user_profiles where id = p_user_id);
    end if;
  end if;

  -- Teto diário só do lado positivo.
  if v_points > 0 then
    select coalesce(sum(points), 0) into v_gained
    from public.trust_events
    where user_id = p_user_id
      and points > 0
      and created_at >= date_trunc('day', now());

    v_points := greatest(0, least(v_points, v_daily_cap - v_gained));
  end if;

  insert into public.trust_events
    (user_id, event_type, points, severity, reason, source, dedupe_key, actor_id, metadata)
  values
    (p_user_id, p_event_type, v_points,
     case when v_points > 0 then 'positive' else p_severity end,
     p_reason, p_source, p_dedupe_key, p_actor_id, coalesce(p_metadata, '{}'::jsonb));

  return public.recalc_trust_score(p_user_id);
end;
$$;

revoke execute on function public.apply_trust_event(uuid, text, integer, text, text, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_trust_event(uuid, text, integer, text, text, text, text, uuid, jsonb)
  to service_role;

-- ────────────────────────────────────────────
-- 8. set_trust_status — estado administrativo
-- ────────────────────────────────────────────
-- Separado de `apply_trust_event` porque status NÃO é pontuação: uma conta
-- pode ser 'restricted' com nota 95 (flag de segurança levantada) e
-- 'active' com nota 20. Mudar para 'blocked' zera a nota via recalc.
create or replace function public.set_trust_status(
  p_user_id  uuid,
  p_status   text,
  p_reason   text default null,
  p_actor_id uuid default null
) returns integer
language plpgsql security definer
set search_path = public as $$
begin
  if p_status not in ('active', 'watch', 'restricted', 'blocked') then
    raise exception 'invalid_trust_status';
  end if;

  update public.user_profiles
    set trust_status = p_status, trust_updated_at = now()
    where id = p_user_id;

  if not found then
    raise exception 'profile_not_found';
  end if;

  insert into public.trust_events
    (user_id, event_type, points, severity, reason, source, actor_id, metadata)
  values
    (p_user_id, 'trust_status_changed', 0,
     case when p_status = 'blocked' then 'critical' else 'positive' end,
     p_reason, 'admin', p_actor_id,
     jsonb_build_object('status', p_status));

  return public.recalc_trust_score(p_user_id);
end;
$$;

revoke execute on function public.set_trust_status(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.set_trust_status(uuid, text, text, uuid) to service_role;

-- ────────────────────────────────────────────
-- 9. trust_daily_recalc — a rotina diária
-- ────────────────────────────────────────────
-- Eventos importantes atualizam a nota NA HORA (apply_trust_event já
-- recalcula). Esta rotina existe para o que muda sem evento nenhum:
-- recuperação (peso decaindo dia a dia) e maturidade (o teto subindo aos 7,
-- 30 e 90 dias). Sem ela, a nota de quem não gera evento ficaria congelada no
-- valor do dia em que o último evento entrou.
--
-- Recalcula só quem pode ter mudado: tem evento passível de decaimento, ou
-- está dentro da janela de maturidade. Conta antiga e sem penalidade não entra
-- na varredura.
create or replace function public.trust_daily_recalc()
returns integer
language plpgsql security definer
set search_path = public as $$
declare
  v_user_id uuid;
  v_count   integer := 0;
begin
  for v_user_id in
    select p.id
    from public.user_profiles p
    where p.trust_status <> 'blocked'
      and (
        p.created_at > now() - interval '91 days'
        or exists (
          select 1 from public.trust_events e
          where e.user_id = p.id
            and e.severity in ('light', 'medium', 'heavy')
            and e.created_at > now() - interval '211 days'
        )
      )
  loop
    perform public.recalc_trust_score(v_user_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.trust_daily_recalc() from public, anon, authenticated;
grant execute on function public.trust_daily_recalc() to service_role;

-- ────────────────────────────────────────────
-- 10. Ban de conta passa a ser evento crítico
-- ────────────────────────────────────────────
-- O ban geral (20260923000001) é a punição terminal do site. Ele já zera a
-- Aura e oculta o conteúdo; passa a zerar o Trust também, pelo caminho
-- oficial (status 'blocked'), para que a conta não volte a resgatar produto
-- físico caso seja desbanida e a nota antiga estivesse alta.
create or replace function public.admin_ban_account(p_user_id uuid, p_reason text)
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_balance integer;
begin
  select balance into v_balance
  from public.user_aura_wallet
  where user_id = p_user_id
  for update;

  update public.user_profiles
  set account_banned_at = now(),
      account_ban_reason = p_reason
  where id = p_user_id;

  if not found then
    raise exception 'profile_not_found';
  end if;

  if v_balance is not null and v_balance > 0 then
    update public.user_aura_wallet
    set balance = 0, updated_at = now()
    where user_id = p_user_id;

    insert into public.aura_ledger (user_id, delta, reason)
    values (p_user_id, -v_balance, 'account_banned_adjustment');
  end if;

  update public.forum_posts set is_hidden = true
    where user_id = p_user_id and is_hidden = false;
  update public.forum_comments set is_hidden = true
    where user_id = p_user_id and is_hidden = false;
  update public.blog_comments set is_hidden = true
    where user_id = p_user_id and is_hidden = false;
  update public.peripheral_reviews set is_hidden = true
    where user_id = p_user_id and is_hidden = false;
  update public.peripheral_comments set is_hidden = true
    where user_id = p_user_id and is_hidden = false;

  -- Duas coisas distintas, de propósito:
  --
  -- 1. O EVENTO crítico, que pesa de verdade no extrato e NUNCA decai. É ele
  --    que sobrevive a um eventual desbanimento — sem ele, `admin_unban_account`
  --    devolveria a nota intacta que a conta tinha antes do ban, e quem foi
  --    banido e perdoado voltaria elegível a produto físico no mesmo instante.
  -- 2. O STATUS 'blocked', que zera a nota enquanto o ban durar.
  perform public.apply_trust_event(
    p_user_id,
    'critical_fraud',
    -40,
    'critical',
    coalesce(p_reason, 'Conta banida'),
    'moderation',
    'account_ban:' || p_user_id::text || ':' || extract(epoch from now())::bigint::text
  );

  perform public.set_trust_status(p_user_id, 'blocked', p_reason, null);
end;
$$;

revoke execute on function public.admin_ban_account(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_ban_account(uuid, text) to service_role;

-- Desbanir devolve o status para 'active' e RECALCULA — a nota volta a ser a
-- soma do extrato (que ainda tem o evento crítico do ban registrado), não o
-- valor bonito de antes. Quem foi banido e perdoado volta com histórico.
create or replace function public.admin_unban_account(p_user_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
  update public.user_profiles
  set account_banned_at = null,
      account_ban_reason = null
  where id = p_user_id;

  if not found then
    raise exception 'profile_not_found';
  end if;

  perform public.set_trust_status(p_user_id, 'active', 'Conta desbanida', null);
end;
$$;

revoke execute on function public.admin_unban_account(uuid) from public, anon, authenticated;
grant execute on function public.admin_unban_account(uuid) to service_role;

-- ────────────────────────────────────────────
-- 11. O trust tier de Aura passa a derivar do Trust Factor
-- ────────────────────────────────────────────
-- Único ponto de contato entre os dois sistemas. As 3 RPCs de toggle
-- (20260923000002) chamam `get_aura_trust_limits`, que chama esta função —
-- nenhuma delas é reescrita aqui.
--
-- O mapeamento preserva o propósito ANTI-FARM do tier: conta nova continua
-- com peso reduzido e teto apertado. O que muda é que o degrau de cima passa
-- a exigir COMPORTAMENTO, não só idade: quem tem 14 dias de conta mas levou
-- suspensão não é mais 'verified' automaticamente.
--   'new'      — conta < 3 dias (inalterado), OU Trust Baixo (< 40);
--   'normal'   — Trust Regular (40–59);
--   'verified' — Trust Bom ou superior (60+).
-- Conta 'restricted'/'blocked' cai para 'new' independentemente da nota: é
-- exatamente o caso de "flag bloqueia função mesmo com pontuação alta".
create or replace function public.get_giver_trust_tier(p_giver_id uuid)
returns text
language plpgsql stable security definer
set search_path = public as $$
declare
  v_created_at  timestamptz;
  v_score       integer;
  v_status      text;
begin
  select created_at, trust_score, trust_status
    into v_created_at, v_score, v_status
  from public.user_profiles
  where id = p_giver_id;

  if v_created_at is null then
    return 'new';
  end if;

  -- Conta descartável recém-criada: o teto apertado é justamente o que trava
  -- o farm, e nenhuma nota inicial deve furá-lo.
  if now() - v_created_at < interval '3 days' then
    return 'new';
  end if;

  if v_status in ('restricted', 'blocked') then
    return 'new';
  end if;

  if v_score >= 60 then
    return 'verified';
  elsif v_score >= 40 then
    return 'normal';
  end if;

  return 'new';
end;
$$;

revoke execute on function public.get_giver_trust_tier(uuid) from public;
grant execute on function public.get_giver_trust_tier(uuid) to service_role, authenticated, anon;

-- ────────────────────────────────────────────
-- 12. can_redeem_physical_item — o gate do prêmio físico
-- ────────────────────────────────────────────
-- Produto FÍSICO e limitado exige Trust "Muito Bom" (80+), não só "verificado".
-- É o item de maior valor real do site e o de maior incentivo a fraude; o
-- corte alto é deliberado: com o teto de maturidade (59/69/79), NENHUMA conta
-- com menos de 90 dias alcança 80, então a trava também cobre multi-conta.
--
-- Status restrito/bloqueado reprova independentemente da nota — é o caso
-- explícito de "uma flag pode bloquear funções específicas mesmo que a
-- pontuação ainda esteja alta".
create or replace function public.can_redeem_physical_item(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public as $$
  select coalesce(
    (select trust_score >= 80 and trust_status = 'active'
     from public.user_profiles where id = p_user_id),
    false
  );
$$;

-- Só service_role: a trava é lida nas rotas do Next (a Central de Aura resolve
-- o gate no servidor e manda pronto para a tela). Diferente de
-- `get_giver_trust_tier`, que já era exposta antes deste sistema, esta função
-- nasce fechada — expô-la ao cliente daria a qualquer sessão um oráculo para
-- sondar o Trust alheio uma conta por vez, que é exatamente o gradiente que o
-- documento manda não publicar.
revoke execute on function public.can_redeem_physical_item(uuid) from public, anon, authenticated;
grant execute on function public.can_redeem_physical_item(uuid) to service_role;

comment on function public.can_redeem_physical_item(uuid) is
  'Gate do prêmio FÍSICO da Central de Aura: Trust >= 80 (Muito Bom) e status active. Espelha TRUST_PHYSICAL_REDEEM_MIN em lib/trust-factor.ts.';

-- ────────────────────────────────────────────
-- 13. Conta nova nasce com Trust
-- ────────────────────────────────────────────
-- Os defaults das colunas já cobrem o INSERT, mas `trust_level` precisa
-- casar com a nota inicial e `trust_score` precisa respeitar o teto de
-- maturidade desde o primeiro instante (50 < 59, então a base passa) — o
-- trigger existe para que uma mudança futura na base ou no teto não deixe a
-- faixa inconsistente no cadastro.
create or replace function public.init_trust_on_profile()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.trust_score := least(coalesce(new.trust_score, 50), public.trust_maturity_cap(new.created_at));
  new.trust_level := public.trust_level_of(new.trust_score);
  new.trust_updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_init_trust_on_profile on public.user_profiles;
create trigger trg_init_trust_on_profile
  before insert on public.user_profiles
  for each row execute function public.init_trust_on_profile();

-- ────────────────────────────────────────────
-- 14. Backfill — contas que já existem
-- ────────────────────────────────────────────
-- Todas começam em 50 (nenhuma tem extrato ainda) e sobem/descem sozinhas
-- conforme o comportamento a partir de agora. O teto de maturidade se aplica
-- na hora: conta criada há 2 dias já entra limitada a 59.
--
-- Exceção: conta JÁ BANIDA nasce 'blocked' — deixá-la em 50 daria a uma conta
-- banida uma nota melhor do que a de um membro ativo que levou um warning.
update public.user_profiles
set trust_status = case when account_banned_at is not null then 'blocked' else trust_status end,
    trust_score  = case
                     when account_banned_at is not null then 0
                     else least(50, public.trust_maturity_cap(created_at))
                   end,
    trust_updated_at = now();

update public.user_profiles
set trust_level = public.trust_level_of(trust_score);
