-- InfinitePay como gateway de CARTÃO da Loja (`STORE_CARD_GATEWAY=infinitepay`).
--
-- Checkout hospedado (link de pagamento integrado): o pedido nasce pendente
-- com o link, o cliente paga na página da InfinitePay e volta para
-- /checkout/card. A confirmação chega pelo retorno e pelo webhook, e as duas
-- passam por `payment_check` na API antes de liberar o pedido.
--
--   • `payment_gateway = 'infinitepay'` — quem cobra o pedido (o pedido não
--                                         tem referência de cobrança no
--                                         nascimento, só o link).
--   • `infinitepay_checkout_url`        — link do pagamento, para o cliente
--                                         voltar a ele enquanto o pedido
--                                         está pendente.
--   • `infinitepay_transaction_nsu`     — a transação APROVADA que quitou o
--                                         pedido. Única: a mesma transação não
--                                         pode quitar dois pedidos.
--   • `infinitepay_invoice_slug`        — código da fatura (vai no `payment_check`).
--   • `infinitepay_receipt_url`         — comprovante da InfinitePay.
--
-- Sem grant novo: store_orders não tem privilégio para anon/authenticated.

alter table public.store_orders
  add column if not exists infinitepay_checkout_url text,
  add column if not exists infinitepay_transaction_nsu text,
  add column if not exists infinitepay_invoice_slug text,
  add column if not exists infinitepay_receipt_url text;

alter table public.store_orders
  drop constraint if exists store_orders_payment_gateway_check;
alter table public.store_orders
  add constraint store_orders_payment_gateway_check
  check (payment_gateway is null or payment_gateway in ('asaas', 'stripe', 'mercadopago', 'infinitepay'));

create unique index if not exists store_orders_infinitepay_transaction_nsu_key
  on public.store_orders (infinitepay_transaction_nsu)
  where infinitepay_transaction_nsu is not null;

comment on column public.store_orders.payment_gateway is
  'Gateway que cobra o pedido quando ele não se deduz por uma referência de cobrança (mercadopago, infinitepay). Nulo = pelas colunas asaas_*/stripe_*.';
comment on column public.store_orders.infinitepay_checkout_url is
  'Link do checkout hospedado da InfinitePay (cartão). O cliente volta a ele enquanto o pedido está pendente.';
comment on column public.store_orders.infinitepay_transaction_nsu is
  'transaction_nsu da InfinitePay que quitou o pedido (conferido por payment_check). Null enquanto não pago.';
comment on column public.store_orders.infinitepay_invoice_slug is
  'Código da fatura (slug) da InfinitePay da transação que quitou o pedido.';
comment on column public.store_orders.infinitepay_receipt_url is
  'Comprovante do pagamento na InfinitePay.';
