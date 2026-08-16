-- O Asaas devolve `transactionReceiptUrl` (comprovante da transação, só
-- depois de paga) e `invoiceUrl` (fatura hospedada no Asaas) na consulta de
-- pagamento. O webhook já reconsulta o pagamento na origem antes de liberar
-- o pedido — aproveitamos essa mesma chamada para cachear o link e evitar
-- que o cliente veja só um ID de cobrança cru como "comprovante".
alter table store_orders
  add column if not exists asaas_receipt_url text;
