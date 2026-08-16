-- Mercado ainda não tinha saído do papel quando a taxa de publicação foi
-- desenhada em cima do Stripe Checkout Session (ver 20260830000000). Como o
-- projeto migrou de vez para Asaas/MisticPay (PIX) e o Mercado nunca chegou a
-- processar pagamento nenhum, trocamos a coluna em vez de manter as duas —
-- mesmo padrão de app/api/store/checkout/route.ts.
--
-- IMPORTANTE — aplicar manualmente via Supabase Dashboard (SQL Editor), como
-- toda migration deste arquivo desde 20260830000000.
alter table public.market_listings
  add column if not exists asaas_payment_id  text,
  add column if not exists asaas_customer_id text,
  add column if not exists pix_copy_paste    text,
  add column if not exists pix_qr_code_base64 text,
  add column if not exists pix_expires_at    timestamptz;

drop index if exists market_listings_session_idx;

create unique index if not exists market_listings_asaas_payment_id_key
  on public.market_listings (asaas_payment_id)
  where asaas_payment_id is not null;

alter table public.market_listings
  drop column if exists stripe_session_id;
