-- Rastreio de estorno (integral ou parcial, via Asaas) sobre um pedido já
-- pago. `refunded_cents` é o total já devolvido — a Asaas permite múltiplos
-- estornos parciais de uma cobrança PIX, então isso acumula, não substitui.
alter table public.store_orders
  add column if not exists refunded_cents integer not null default 0,
  add column if not exists refund_reason text,
  add column if not exists refunded_at timestamptz;
