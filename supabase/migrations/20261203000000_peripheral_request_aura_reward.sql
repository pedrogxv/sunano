-- Recompensa de Aura por pedido de periférico cadastrado.
--
-- Quem pediu ganha +10 Aura quando a equipe marca o pedido como "added"
-- (cadastrado na wiki). "duplicate" NÃO paga: o periférico já existia, o
-- pedido não acrescentou nada ao catálogo.
--
-- Valor FIXO, sem o multiplicador de ofensiva/VIP (`apply_aura_gain`): é
-- bônus por contribuição, na mesma régua de missão e conquista, não
-- atividade. Espelha PERIPHERAL_REQUEST_AURA_REWARD em
-- lib/peripheral-requests.ts; o daqui é o que vale.
--
-- Em TRIGGER (não na rota) pelo mesmo motivo da notificação de status
-- (20261130000000): nenhum caminho novo de atualização esquece de pagar.
--
-- Uma vez só, por dois cadeados:
--   1. `peripheral_requests.aura_rewarded`: marcado no próprio pedido. Ir de
--      "added" para outro status e voltar não paga de novo.
--   2. Índice único do ledger por (pessoa, periférico): dois pedidos da mesma
--      pessoa para o mesmo modelo (um recusado por engano e reaberto, por
--      exemplo) pagam uma vez.
-- Trocar o status de volta NÃO estorna: a Aura já pode ter sido gasta, e o
-- saldo negativo que um estorno geraria não tem tratamento em lugar nenhum.

alter table public.peripheral_requests
  add column if not exists aura_rewarded integer;

comment on column public.peripheral_requests.aura_rewarded is
  'Aura paga a quem pediu quando o pedido virou "added". null = nada pago (ainda, ou nunca).';

-- ────────────────────────────────────────────
-- Motivo novo no ledger. O check é recriado A PARTIR DO QUE ESTÁ NO BANCO,
-- não de uma lista digitada aqui: o histórico de migrations já divergiu do
-- remoto antes, e reescrever a lista inteira apagaria em silêncio qualquer
-- motivo que exista lá e não no último arquivo que redefiniu o check.
-- ────────────────────────────────────────────
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
    where conname = 'aura_ledger_reason_check'
      and conrelid = 'public.aura_ledger'::regclass;

  if v_def is null then
    raise exception 'aura_ledger_reason_check não encontrado';
  end if;

  if position('''peripheral_request_added''' in v_def) = 0 then
    if position('ARRAY[' in v_def) = 0 then
      raise exception 'formato inesperado de aura_ledger_reason_check: %', v_def;
    end if;
    v_def := regexp_replace(v_def, 'ARRAY\[', 'ARRAY[''peripheral_request_added''::text, ');
    alter table public.aura_ledger drop constraint aura_ledger_reason_check;
    execute format('alter table public.aura_ledger add constraint aura_ledger_reason_check %s', v_def);
  end if;
end;
$$;

create unique index if not exists aura_ledger_peripheral_request_added_unique
  on public.aura_ledger (user_id, source_peripheral_id)
  where reason = 'peripheral_request_added';

-- ────────────────────────────────────────────
-- BEFORE UPDATE: grava `aura_rewarded` na mesma linha que muda o status, sem
-- um segundo UPDATE (que dispararia os triggers de novo).
-- ────────────────────────────────────────────
create or replace function public.trg_reward_peripheral_request_added()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_reward   constant integer := 10;
  v_inserted integer;
begin
  if new.status <> 'added' or old.status = 'added' or new.aura_rewarded is not null then
    return new;
  end if;

  -- Ledger primeiro: é ele que decide (pelo índice único) se esta pessoa já
  -- recebeu por este periférico. Só credita a carteira se a linha entrou.
  insert into public.aura_ledger (user_id, delta, reason, source_peripheral_id)
  values (new.user_id, v_reward, 'peripheral_request_added', new.peripheral_id)
  on conflict (user_id, source_peripheral_id) where reason = 'peripheral_request_added' do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return new;
  end if;

  insert into public.user_aura_wallet (user_id, balance) values (new.user_id, v_reward)
    on conflict (user_id) do update
      set balance = user_aura_wallet.balance + v_reward, updated_at = now();

  new.aura_rewarded := v_reward;
  return new;
end;
$$;

drop trigger if exists trg_peripheral_requests_reward_added on public.peripheral_requests;
create trigger trg_peripheral_requests_reward_added
  before update of status on public.peripheral_requests
  for each row execute function public.trg_reward_peripheral_request_added();

revoke execute on function public.trg_reward_peripheral_request_added() from public, anon, authenticated;

-- ────────────────────────────────────────────
-- Acerto: pedidos que já estavam "added" antes desta migration recebem a
-- mesma recompensa. Idempotente pelos mesmos dois cadeados do trigger.
-- ────────────────────────────────────────────
do $$
declare
  v_reward   constant integer := 10;
  r          record;
  v_inserted integer;
begin
  for r in
    select id, user_id, peripheral_id
      from public.peripheral_requests
      where status = 'added' and aura_rewarded is null
      order by created_at
      for update
  loop
    insert into public.aura_ledger (user_id, delta, reason, source_peripheral_id)
    values (r.user_id, v_reward, 'peripheral_request_added', r.peripheral_id)
    on conflict (user_id, source_peripheral_id) where reason = 'peripheral_request_added' do nothing;

    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      continue;
    end if;

    insert into public.user_aura_wallet (user_id, balance) values (r.user_id, v_reward)
      on conflict (user_id) do update
        set balance = user_aura_wallet.balance + v_reward, updated_at = now();

    update public.peripheral_requests set aura_rewarded = v_reward where id = r.id;
  end loop;
end;
$$;
