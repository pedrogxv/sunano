-- Stripe como gateway ALTERNATIVO da Loja (`PAYMENT_GATEWAY=stripe`).
--
-- A Asaas continua sendo o padrão. As colunas `stripe_session_id` e
-- `stripe_payment_intent_id` já existem em `store_orders` desde a primeira
-- integração com o Stripe (antes da MisticPay) e voltam a ser escritas:
--   • `stripe_payment_intent_id` — PIX e cartão, gravado no checkout (o
--     cartão é digitado no nosso site, Payment Element, captura manual);
--   • `stripe_session_id`        — legado do Checkout hospedado (sem uso novo).
--
-- O webhook (`/api/webhooks/stripe`) acha o pedido por essas colunas a cada
-- evento; sem índice, cada evento varreria a tabela inteira. Parciais porque
-- a imensa maioria dos pedidos (Asaas, Aura) tem as duas nulas.
--
-- Sem coluna nova de propósito: o gateway de um pedido é deduzido de qual
-- referência ele tem (`orderPaymentGateway` em lib/server/payments/gateway.ts),
-- e o fluxo da Asaas não precisa desta migration para continuar funcionando.

create index if not exists store_orders_stripe_payment_intent_id_idx
  on public.store_orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists store_orders_stripe_session_id_idx
  on public.store_orders (stripe_session_id)
  where stripe_session_id is not null;

comment on column public.store_orders.is_sandbox is
  'true = pedido criado em ambiente de teste do gateway (ASAAS_ENV=sandbox ou STRIPE_ENV=sandbox). Gravado no checkout e nunca alterado depois. Telas do cliente, dashboard/receita e a fila do admin filtram por is_sandbox = false por padrão.';
