-- Compra na Loja passa a render Aura: 1 a cada R$ 10.
--
-- Decidido em 01/10/2026. Antes nenhuma compra creditava nada, e a página
-- do produto não tinha o que mostrar no benefício "Aura recebida".
--
-- Quando: na ENTREGA (status `delivered`). Pedido sem envio (serviço, item
-- do site) não tem entrega, então credita no PAGAMENTO (`paid`). Creditar no
-- pagamento de um produto físico deixaria a Aura com quem cancela ou devolve
-- antes de receber, e a Aura já pode ter sido gasta quando o estorno vem.
--
-- Base: o preço PIX do pedido (`pix_price_cents`; nulo no PIX, onde o total
-- já é o preço PIX), menos o que foi reembolsado. É o mesmo número que a
-- página do produto usa para anunciar, então pagar no cartão não rende mais
-- Aura do que o anunciado.
--
-- Valor FIXO, sem o multiplicador de ofensiva/VIP: compra não é atividade,
-- mesma régua de missão e de pedido de periférico (20261203000000).
-- Espelha STORE_PURCHASE_CENTS_PER_AURA em lib/store-purchase-aura.ts; o
-- daqui é o que vale.
--
-- Uma vez só, por dois cadeados: `store_orders.aura_rewarded` e o índice
-- único do ledger por pedido. Mudar o status depois NÃO estorna (mesmo
-- motivo do pedido de periférico: o saldo negativo de um estorno não tem
-- tratamento em lugar nenhum).

alter table public.store_orders
  add column if not exists aura_rewarded integer;

comment on column public.store_orders.aura_rewarded is
  'Aura creditada ao dono pela compra (1 a cada R$ 10 do preço PIX). null = nada creditado (ainda, ou nunca).';

alter table public.aura_ledger
  add column if not exists source_order_id uuid references public.store_orders(id) on delete set null;

-- Motivo novo, recriando o check A PARTIR DO QUE ESTÁ NO BANCO (mesmo
-- cuidado de 20261203000000: o histórico já divergiu do remoto antes).
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

  if position('''store_purchase''' in v_def) = 0 then
    if position('ARRAY[' in v_def) = 0 then
      raise exception 'formato inesperado de aura_ledger_reason_check: %', v_def;
    end if;
    v_def := regexp_replace(v_def, 'ARRAY\[', 'ARRAY[''store_purchase''::text, ');
    alter table public.aura_ledger drop constraint aura_ledger_reason_check;
    execute format('alter table public.aura_ledger add constraint aura_ledger_reason_check %s', v_def);
  end if;
end;
$$;

create unique index if not exists aura_ledger_store_purchase_unique
  on public.aura_ledger (source_order_id)
  where reason = 'store_purchase';

-- BEFORE UPDATE: grava `aura_rewarded` na mesma linha que muda o status,
-- sem um segundo UPDATE que dispararia os triggers de pedido de novo.
create or replace function public.trg_reward_store_purchase_aura()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_cents_per_aura constant integer := 1000;
  v_owner    uuid;
  v_base     integer;
  v_reward   integer;
  v_inserted integer;
begin
  if new.aura_rewarded is not null or new.status is not distinct from old.status then
    return new;
  end if;

  if not (
    new.status = 'delivered'
    or (new.status = 'paid' and new.requires_shipping_address = false)
  ) then
    return new;
  end if;

  -- Teste, resgate pago em Aura (total 0) e pedido sem dono não rendem.
  if new.is_sandbox or new.payment_method = 'aura' or new.aura_cost_paid is not null then
    return new;
  end if;

  v_owner := public.store_order_owner_id(new.metadata, new.user_id);
  if v_owner is null then
    return new;
  end if;

  v_base := greatest(coalesce(new.pix_price_cents, new.total_cents) - coalesce(new.refunded_cents, 0), 0);
  v_reward := v_base / v_cents_per_aura;
  if v_reward <= 0 then
    return new;
  end if;

  insert into public.aura_ledger (user_id, delta, reason, source_order_id)
  values (v_owner, v_reward, 'store_purchase', new.id)
  on conflict (source_order_id) where reason = 'store_purchase' do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return new;
  end if;

  insert into public.user_aura_wallet (user_id, balance) values (v_owner, v_reward)
    on conflict (user_id) do update
      set balance = user_aura_wallet.balance + v_reward, updated_at = now();

  new.aura_rewarded := v_reward;
  return new;
end;
$$;

revoke execute on function public.trg_reward_store_purchase_aura() from public, anon, authenticated;

drop trigger if exists trg_store_orders_reward_aura on public.store_orders;
create trigger trg_store_orders_reward_aura
  before update of status on public.store_orders
  for each row execute function public.trg_reward_store_purchase_aura();
