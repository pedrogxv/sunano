-- Mercado Pago como gateway de CARTÃO da Loja (`STORE_CARD_GATEWAY=mercadopago`).
--
-- O gateway passa a ser escolhido POR FORMA DE PAGAMENTO (PIX num, cartão
-- noutro). A Asaas e o Stripe seguem reconhecidos pela coluna de referência da
-- cobrança, que o checkout grava no mesmo insert do pedido. O Mercado Pago não
-- tem essa referência no nascimento: o pedido é criado ANTES do pagamento (o
-- cartão é digitado depois, em /checkout/card, no Card Payment Brick), e um
-- cartão recusado não deixa pagamento nenhum. Daí as duas colunas:
--
--   • `payment_gateway`         — quem cobra o pedido. Escrita só para o
--                                 Mercado Pago por ora; nula = deduz pelas
--                                 referências, como sempre (`orderPaymentGateway`
--                                 em lib/payment-gateways.ts).
--   • `mercadopago_payment_id`  — o pagamento APROVADO que quita o pedido
--                                 (`binary_mode`: não existe "em análise").
--                                 Recusas não ficam aqui.
--
-- Um pagamento pertence a UM pedido: o webhook e o estorno acham o pedido por
-- este id com `.maybeSingle()`, então o índice é único (parcial, porque quase
-- todo pedido tem a coluna nula).
--
-- Sem grant novo: store_orders não tem privilégio para anon/authenticated.

alter table public.store_orders
  add column if not exists payment_gateway text,
  add column if not exists mercadopago_payment_id text;

alter table public.store_orders
  drop constraint if exists store_orders_payment_gateway_check;
alter table public.store_orders
  add constraint store_orders_payment_gateway_check
  check (payment_gateway is null or payment_gateway in ('asaas', 'stripe', 'mercadopago'));

create unique index if not exists store_orders_mercadopago_payment_id_key
  on public.store_orders (mercadopago_payment_id)
  where mercadopago_payment_id is not null;

comment on column public.store_orders.payment_gateway is
  'Gateway que cobra o pedido quando ele não se deduz por uma referência de cobrança (hoje: mercadopago). Nulo = pelas colunas asaas_*/stripe_*.';
comment on column public.store_orders.mercadopago_payment_id is
  'Id do pagamento do Mercado Pago que quita o pedido (aprovado). Recusas não são gravadas.';
comment on column public.store_orders.is_sandbox is
  'true = pedido criado em ambiente de teste do gateway (ASAAS_ENV, STRIPE_ENV ou MERCADOPAGO_ENV = sandbox). Gravado no checkout e nunca alterado depois. Telas do cliente, dashboard/receita e a fila do admin filtram por is_sandbox = false por padrão.';
