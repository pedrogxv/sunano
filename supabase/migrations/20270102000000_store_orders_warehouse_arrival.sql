-- "Chegou no nosso armazém": a etapa entre "Pedido feito" e "Enviado".
--
-- Coluna, não status novo. O status `paid` já significa "pago, com endereço,
-- esperando sair" e é o que `trg_store_orders_shipping_stage`, os webhooks, o
-- estorno, as abas do admin e o Discord leem. Um status a mais obrigaria a
-- reescrever todos esses caminhos para dizer uma coisa que é só um marco
-- DENTRO de `paid`: o produto chegou ao armazém e está sendo conferido para
-- ser postado. A data é o próprio sinal (nulo = ainda não chegou).
--
-- Quem marca é o admin (`markOrderWarehouseArrived`), só com o pedido em
-- `paid` e de item físico. Depois de `shipped` a coluna fica como histórico.

alter table public.store_orders
  add column if not exists warehouse_arrived_at timestamptz;

comment on column public.store_orders.warehouse_arrived_at is
  'Quando o produto chegou ao armazém da loja. Marco dentro de "paid"; nulo = ainda não chegou.';
