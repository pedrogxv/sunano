-- Aura da compra na Loja passa a ser creditada no PAGAMENTO e estornada
-- quando o pedido deixa de estar pago.
--
-- Decidido em 07/10/2026. Antes (20261213000002) o crédito era na ENTREGA,
-- justamente porque não havia estorno: creditar no pagamento deixava a Aura
-- com quem cancelava ou devolvia antes de receber. Agora o trigger RECONCILIA
-- em vez de só creditar uma vez:
--
--   devido = 1 a cada R$ 10 de (preço PIX - reembolsado), enquanto o pedido
--            estiver pago (paid / awaiting_shipping_info / shipped /
--            delivered); 0 em qualquer outro status (cancelled, refunded,
--            expired, pending).
--   delta  = devido - o que já foi creditado (`aura_rewarded`).
--
-- Cobre, com uma regra só: pagamento confirmado (+), estorno total (-),
-- estorno parcial (- proporcional, via `refunded_cents`), estorno desfeito
-- na Asaas (`refunded` -> `paid`, + de novo) e pagamento manual de pedido
-- expirado/cancelado (+).
--
-- Saldo: o débito é limitado a zero (`greatest(balance - x, 0)`, mesma régua
-- do resto do site; `user_aura_wallet.balance` tem `check (balance >= 0)`).
-- Aura já GASTA antes do estorno não volta. O ledger guarda o valor cheio do
-- estorno, para a moderação ver quanto deveria ter saído.
--
-- `total_earned` (Aura farmada, trilha de conquistas) não é tocado: o
-- contador nunca desce por design (20260923000001, 20260930000001).
--
-- Trava: `aura_rewarded`, lido do OLD. O BEFORE UPDATE roda com a linha já
-- travada e na versão mais nova, então dois webhooks simultâneos não creditam
-- duas vezes. Por isso o índice único do ledger por pedido sai: o pedido
-- agora pode ter mais de uma linha (crédito, estorno, recrédito).

-- Motivo novo, recriando o check A PARTIR DO QUE ESTÁ NO BANCO (mesmo
-- cuidado de 20261213000002).
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

  if position('''store_purchase_reversal''' in v_def) = 0 then
    if position('ARRAY[' in v_def) = 0 then
      raise exception 'formato inesperado de aura_ledger_reason_check: %', v_def;
    end if;
    v_def := regexp_replace(v_def, 'ARRAY\[', 'ARRAY[''store_purchase_reversal''::text, ');
    alter table public.aura_ledger drop constraint aura_ledger_reason_check;
    execute format('alter table public.aura_ledger add constraint aura_ledger_reason_check %s', v_def);
  end if;
end;
$$;

drop index if exists public.aura_ledger_store_purchase_unique;
create index if not exists aura_ledger_source_order_idx
  on public.aura_ledger (source_order_id)
  where source_order_id is not null;

comment on column public.store_orders.aura_rewarded is
  'Aura que a compra rende AGORA ao dono (1 a cada R$ 10 do preço PIX, menos o reembolsado). 0 depois de estornada; null = nunca creditada.';

create or replace function public.trg_reward_store_purchase_aura()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_cents_per_aura constant integer := 1000;
  v_owner  uuid;
  v_prev   integer := coalesce(old.aura_rewarded, 0);
  v_owed   integer := 0;
  v_delta  integer;
begin
  -- `aura_rewarded` é só do trigger: o valor vem do OLD, nunca do UPDATE.
  new.aura_rewarded := old.aura_rewarded;

  if new.status is not distinct from old.status
     and new.refunded_cents is not distinct from old.refunded_cents then
    return new;
  end if;

  v_owner := public.store_order_owner_id(new.metadata, new.user_id);
  if v_owner is null then
    return new;
  end if;

  -- Teste e resgate pago em Aura (total 0) não rendem: devido fica 0, e um
  -- crédito antigo (não deveria existir) seria estornado.
  if new.status in ('paid', 'awaiting_shipping_info', 'shipped', 'delivered')
     and not new.is_sandbox
     and new.payment_method is distinct from 'aura'
     and new.aura_cost_paid is null then
    v_owed := greatest(coalesce(new.pix_price_cents, new.total_cents) - coalesce(new.refunded_cents, 0), 0)
              / v_cents_per_aura;
  end if;

  v_delta := v_owed - v_prev;
  if v_delta = 0 then
    return new;
  end if;

  insert into public.aura_ledger (user_id, delta, reason, source_order_id)
  values (
    v_owner,
    v_delta,
    case when v_delta > 0 then 'store_purchase' else 'store_purchase_reversal' end,
    new.id
  );

  insert into public.user_aura_wallet (user_id, balance) values (v_owner, greatest(v_delta, 0))
    on conflict (user_id) do update
      set balance = greatest(user_aura_wallet.balance + v_delta, 0), updated_at = now();

  new.aura_rewarded := v_owed;
  return new;
end;
$$;

revoke execute on function public.trg_reward_store_purchase_aura() from public, anon, authenticated;

drop trigger if exists trg_store_orders_reward_aura on public.store_orders;
create trigger trg_store_orders_reward_aura
  before update of status, refunded_cents on public.store_orders
  for each row execute function public.trg_reward_store_purchase_aura();
