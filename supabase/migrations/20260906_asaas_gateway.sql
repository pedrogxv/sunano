-- Adiciona suporte ao gateway Asaas (PIX) ao lado do MisticPay. Diferente da
-- migração Stripe→MisticPay, aqui NÃO trocamos de gateway: o MisticPay
-- continua sendo o padrão (PAYMENT_GATEWAY=misticpay), só ganhamos as colunas
-- necessárias para o Asaas funcionar quando a env var apontar para ele.
--
-- O Asaas exige um "customer" cadastrado antes de criar a cobrança PIX;
-- cacheamos o id em user_profiles para não recriar o cliente a cada compra
-- de quem já tem conta (guests continuam criando um novo customer sempre).
alter table store_orders
  add column if not exists asaas_payment_id text,
  add column if not exists asaas_customer_id text;

create unique index if not exists store_orders_asaas_payment_id_key
  on store_orders (asaas_payment_id)
  where asaas_payment_id is not null;

alter table user_profiles
  add column if not exists asaas_customer_id text;
