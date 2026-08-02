-- Terceiro critério de evento: 'aura_redeem'. Diferente de 'manual_opt_in'
-- (20260814_manual_opt_in_events.sql), que reaproveita `claim_event_medal`
-- sem alterá-la (só verifica active/vagas), este precisa debitar Aura do
-- usuário — reaproveitando user_aura_wallet/aura_ledger
-- (20260806_forum_aura.sql) — então a função ganha um branch novo.
--
-- Vagas viram opcionais (null = ilimitado, só faz sentido pra aura_redeem;
-- first_n_signups/manual_opt_in continuam sempre exigindo um número, mas
-- isso é reforçado na aplicação, lib/server/repositories/events-repository.ts,
-- não aqui no banco).

alter table public.events drop constraint if exists events_criteria_type_check;
alter table public.events add constraint events_criteria_type_check
  check (criteria_type in ('first_n_signups', 'manual_opt_in', 'aura_redeem'));

alter table public.events add column if not exists aura_cost integer null;
alter table public.events drop constraint if exists events_aura_cost_check;
alter table public.events
  add constraint events_aura_cost_check
  check (aura_cost is null or aura_cost > 0);

alter table public.events alter column max_participants drop not null;
alter table public.events drop constraint if exists events_max_participants_check;
alter table public.events
  add constraint events_max_participants_check
  check (max_participants is null or max_participants > 0);

alter table public.aura_ledger drop constraint if exists aura_ledger_reason_check;
alter table public.aura_ledger
  add constraint aura_ledger_reason_check
  check (reason in (
    'post_aura_received', 'post_aura_removed',
    'comment_aura_received', 'comment_aura_removed',
    'event_medal_redeemed'
  ));

-- ────────────────────────────────────────────
-- claim_event_medal: ganha o branch de débito de Aura pra aura_redeem.
--
-- Ordem importante: a medalha é concedida (insert ... on conflict do
-- nothing) ANTES do débito de aura. Se o débito falhar (saldo
-- insuficiente), o `raise exception` desfaz a transação inteira —
-- inclusive o insert em user_medals feito alguns comandos antes — sem
-- precisar de nenhum "desfazer" manual. Isso também elimina qualquer janela
-- de corrida entre "checar se já tem a medalha" e "cobrar aura": o próprio
-- insert com on conflict já é a checagem atômica.
-- ────────────────────────────────────────────
create or replace function public.claim_event_medal(p_event_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_medal_id      uuid;
  v_criteria_type text;
  v_max           integer;
  v_count         integer;
  v_aura_cost     integer;
  v_inserted      integer;
  v_debited       integer;
begin
  select medal_id, criteria_type, max_participants, current_count, aura_cost
    into v_medal_id, v_criteria_type, v_max, v_count, v_aura_cost
  from public.events
  where id = p_event_id and active = true
  for update;

  if not found then
    return false;
  end if;

  if v_max is not null and v_count >= v_max then
    return false;
  end if;

  insert into public.user_medals (user_id, medal_id)
  values (p_user_id, v_medal_id)
  on conflict (user_id, medal_id) do nothing;

  get diagnostics v_inserted = row_count;

  -- Usuário já tinha a medalha (clique duplicado/retry): não cobra aura de
  -- novo nem soma a vaga de novo.
  if v_inserted = 0 then
    return true;
  end if;

  if v_criteria_type = 'aura_redeem' and coalesce(v_aura_cost, 0) > 0 then
    update public.user_aura_wallet
    set balance = balance - v_aura_cost, updated_at = now()
    where user_id = p_user_id and balance >= v_aura_cost;

    get diagnostics v_debited = row_count;

    -- Sem linha de carteira (saldo implícito 0) ou saldo < custo: desfaz a
    -- transação inteira, inclusive o insert em user_medals acima.
    if v_debited = 0 then
      raise exception 'insufficient_aura_balance';
    end if;

    insert into public.aura_ledger (user_id, delta, reason, giver_id)
    values (p_user_id, -v_aura_cost, 'event_medal_redeemed', null);
  end if;

  update public.events
  set current_count = current_count + 1,
      active = case when v_max is null then active else (current_count + 1 < v_max) end,
      end_date = case when v_max is not null and current_count + 1 >= v_max then now() else end_date end,
      updated_at = now()
  where id = p_event_id;

  return true;
end;
$$;

revoke execute on function public.claim_event_medal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_event_medal(uuid, uuid) to service_role;
