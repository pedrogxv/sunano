-- Duas features aditivas para "Conquistas" (app/admin/eventos):
--
-- 1. `events.requires_vip` — flag que vale para os 3 critérios já existentes.
--    Combinada com `first_n_signups` ela vira "primeiros N VIPs do site": a
--    própria `claim_event_medal`, chamada no login/cadastro, passa a negar
--    quem não é VIP. Prospectivo, não retroativo — mesmo comportamento que
--    `first_n_signups` sempre teve.
--
-- 2. Critério novo `staff_grant` — ninguém resgata sozinho, a Staff concede
--    manualmente escolhendo o usuário (nova RPC `grant_event_medal`).
--    `user_medals.granted_by` guarda quem concedeu, só para essa trilha.

alter table public.events drop constraint if exists events_criteria_type_check;
alter table public.events add constraint events_criteria_type_check
  check (criteria_type in ('first_n_signups', 'manual_opt_in', 'aura_redeem', 'staff_grant'));

alter table public.events add column if not exists requires_vip boolean not null default false;

alter table public.user_medals add column if not exists granted_by uuid null references auth.users(id) on delete set null;

-- ────────────────────────────────────────────
-- claim_event_medal: ganha o gate de VIP, na frente de tudo. Continua
-- servindo first_n_signups (login/cadastro) e manual_opt_in/aura_redeem
-- (clique do usuário) — o critério em si não muda, só quem pode passar.
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
  v_requires_vip  boolean;
  v_account_tier  text;
  v_vip_expires   timestamptz;
  v_inserted      integer;
  v_debited       integer;
begin
  select medal_id, criteria_type, max_participants, current_count, aura_cost, requires_vip
    into v_medal_id, v_criteria_type, v_max, v_count, v_aura_cost, v_requires_vip
  from public.events
  where id = p_event_id and active = true
  for update;

  if not found then
    return false;
  end if;

  if v_max is not null and v_count >= v_max then
    return false;
  end if;

  if v_requires_vip then
    select account_tier, vip_expires_at into v_account_tier, v_vip_expires
    from public.user_profiles
    where id = p_user_id;

    if not found or not public.is_vip_active(v_account_tier, v_vip_expires) then
      return false;
    end if;
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

-- ────────────────────────────────────────────
-- grant_event_medal: contraparte de claim_event_medal para staff_grant — a
-- concessão não é disparada pelo usuário, é a Staff quem escolhe o alvo.
-- Mesmo esqueleto (lock + insert idempotente + contador), sem o requires_vip
-- (quem concede já está escolhendo a dedo) e sem custo de Aura.
-- ────────────────────────────────────────────
create or replace function public.grant_event_medal(p_event_id uuid, p_user_id uuid, p_granted_by uuid)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_medal_id      uuid;
  v_criteria_type text;
  v_max           integer;
  v_count         integer;
  v_inserted      integer;
begin
  select medal_id, criteria_type, max_participants, current_count
    into v_medal_id, v_criteria_type, v_max, v_count
  from public.events
  where id = p_event_id
  for update;

  if not found or v_criteria_type <> 'staff_grant' then
    return false;
  end if;

  if v_max is not null and v_count >= v_max then
    return false;
  end if;

  insert into public.user_medals (user_id, medal_id, granted_by)
  values (p_user_id, v_medal_id, p_granted_by)
  on conflict (user_id, medal_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return true;
  end if;

  update public.events
  set current_count = current_count + 1,
      updated_at = now()
  where id = p_event_id;

  return true;
end;
$$;

revoke execute on function public.grant_event_medal(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.grant_event_medal(uuid, uuid, uuid) to service_role;
