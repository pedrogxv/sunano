-- Remoção definitiva do gateway MisticPay: Asaas é o único gateway de
-- pagamento da Loja/Bazar a partir daqui. O client, a rota de webhook
-- (/api/webhooks/misticpay) e o branch de PAYMENT_GATEWAY foram removidos
-- do código na mesma mudança — estas colunas não têm mais nenhum escritor.
--
-- Não há pedidos pagos via MisticPay em produção a preservar; caso surja
-- algum pedido legado, o identificador MisticPay já não é consultado por
-- nenhuma tela (o histórico continua acessível pelo painel da MisticPay).

drop index if exists store_orders_misticpay_transaction_id_key;

alter table store_orders
  drop column if exists misticpay_transaction_id,
  drop column if exists misticpay_e2e;
