-- O saque pago passa a DEBITAR o saldo do afiliado.
--
-- Bug que isto corrige: `balance_cents` nunca era debitado em lugar nenhum do
-- fluxo de saque. O "disponível" era calculado como
-- `balance_cents - soma(saques com status 'requested')`, então enquanto o saque
-- estava em análise o valor ficava só RESERVADO — e no instante em que o admin
-- marcava como pago, ele saía da conta de reservados sem nunca sair do saldo.
-- Resultado: o dinheiro voltava a aparecer como disponível e podia ser sacado
-- de novo, indefinidamente.
--
-- Não apareceu até hoje porque o sistema está zerado (0 saques, 0 comissões);
-- teria aparecido no primeiro saque pago real.
--
-- Correção seguindo o princípio do resto do módulo: o ledger
-- (`affiliate_commission_events`) é a fonte de verdade e `balance_cents` é o
-- cache somado por RPC. O pagamento vira uma LINHA no ledger, não um UPDATE
-- solto — assim o extrato explica o saldo por completo e o débito fica
-- auditável junto com as comissões.

-- ---------------------------------------------------------------------------
-- Ledger: acomodar eventos que não vêm de um pedido
-- ---------------------------------------------------------------------------
-- `order_id` era NOT NULL porque todo evento nascia de uma venda. Um saque não
-- tem pedido, então a coluna passa a aceitar null e ganha uma irmã que aponta
-- para o saque que originou a linha.
alter table public.affiliate_commission_events
  alter column order_id drop not null;

alter table public.affiliate_commission_events
  add column if not exists payout_id uuid references public.affiliate_payout_requests(id) on delete set null;

-- Novo tipo `payout_debit`. O check é reescrito (Postgres não estende check
-- existente), mesmo padrão das constraints de `notifications`.
alter table public.affiliate_commission_events drop constraint if exists affiliate_commission_events_type_check;
alter table public.affiliate_commission_events add constraint affiliate_commission_events_type_check
  check (type in ('credit', 'refund_debit', 'adjustment', 'payout_debit'));

-- Coerência entre tipo e origem: evento de venda exige `order_id`, evento de
-- saque exige `payout_id`. Sem isto, um `payout_debit` sem `payout_id` viraria
-- uma linha órfã impossível de reconciliar com a fila de saques.
alter table public.affiliate_commission_events drop constraint if exists affiliate_commission_events_origin_check;
alter table public.affiliate_commission_events add constraint affiliate_commission_events_origin_check
  check (
    (type = 'payout_debit' and payout_id is not null)
    or (type <> 'payout_debit' and order_id is not null)
  );

-- No máximo um débito por saque — é a idempotência real do pagamento, do mesmo
-- jeito que `affiliate_commission_events_order_credit_uidx` protege o crédito
-- da venda contra a reentrega do webhook. Aqui protege contra duplo clique em
-- "marcar como pago" e contra duas abas do admin decidindo o mesmo saque.
create unique index if not exists affiliate_commission_events_payout_debit_uidx
  on public.affiliate_commission_events (payout_id)
  where type = 'payout_debit';

-- ---------------------------------------------------------------------------
-- Marcar saque como pago (atômico: status + débito na mesma transação)
-- ---------------------------------------------------------------------------
-- Antes isto era um UPDATE no TypeScript sem débito nenhum. Como RPC, o
-- `WHERE status = 'requested'` e o insert do ledger acontecem na mesma
-- transação: se o saque já tiver sido decidido por outro admin, nada acontece e
-- ninguém é debitado duas vezes.
--
-- Códigos: not_found | not_pending
create or replace function public.mark_affiliate_payout_paid(
  p_payout_id uuid,
  p_reviewer_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_affiliate_id uuid;
  v_amount integer;
begin
  -- O status entra no WHERE (não só o id) para fechar a corrida com outro
  -- admin decidindo o mesmo saque no mesmo instante.
  update public.affiliate_payout_requests
  set status = 'paid',
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      paid_at = now()
  where id = p_payout_id
    and status = 'requested'
  returning affiliate_id, amount_cents into v_affiliate_id, v_amount;

  if v_affiliate_id is null then
    -- Ou o saque não existe, ou já foi decidido. A distinção importa para a
    -- mensagem que o admin lê.
    if exists (select 1 from public.affiliate_payout_requests where id = p_payout_id) then
      return jsonb_build_object('ok', false, 'code', 'not_pending');
    end if;
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- O dinheiro saiu de verdade (o admin fez o PIX): registra no ledger e
  -- desconta do cache de saldo.
  insert into public.affiliate_commission_events
    (affiliate_id, order_id, payout_id, type, amount_cents, order_total_cents, commission_bps, note)
  values
    (v_affiliate_id, null, p_payout_id, 'payout_debit', -v_amount, 0, 0, 'Saque pago via PIX');

  update public.affiliates
  set balance_cents = balance_cents - v_amount,
      updated_at = now()
  where id = v_affiliate_id;

  return jsonb_build_object('ok', true, 'amount_cents', v_amount, 'affiliate_id', v_affiliate_id);
end;
$$;

revoke execute on function public.mark_affiliate_payout_paid(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_affiliate_payout_paid(uuid, uuid) to service_role;
