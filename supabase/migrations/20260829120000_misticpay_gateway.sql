-- Troca do gateway de pagamento de Stripe para MisticPay (PIX). A MisticPay
-- não tem um "session id" hospedado como o Stripe Checkout — cada compra
-- gera uma transação PIX direta (QR code + copia-e-cola), então trocamos
-- as colunas específicas do Stripe pelo equivalente MisticPay. Mantemos as
-- colunas antigas por enquanto (não dropamos dado histórico de pedidos já
-- pagos via Stripe), só paramos de escrever nelas.
alter table store_orders
  add column if not exists misticpay_transaction_id text,
  add column if not exists misticpay_e2e text,
  add column if not exists pix_copy_paste text,
  add column if not exists pix_qr_code_base64 text,
  add column if not exists pix_expires_at timestamptz;

create unique index if not exists store_orders_misticpay_transaction_id_key
  on store_orders (misticpay_transaction_id)
  where misticpay_transaction_id is not null;
