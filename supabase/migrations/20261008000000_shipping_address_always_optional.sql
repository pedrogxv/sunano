-- Endereço de entrega: sempre opcional no checkout, cobrado depois de pagar.
--
-- Antes, "o endereço é obrigatório?" era decidido por uma env
-- (SHIPPING_ADDRESS_REQUIRED). A env saiu: pedir CEP antes do pagamento é o
-- que mais derruba conversão, e o dado só é necessário na hora de despachar.
-- A compra fecha sem endereço e o cliente completa em "Meus Pedidos"
-- (status `awaiting_shipping_info`).
--
-- O que passa a variar por produto é se o pedido PRECISA de endereço, via
-- `store_products.requires_shipping` (já existente). Um serviço marca false
-- e nunca entra na fila de "falta endereço"; um serviço que precisa do
-- endereço mesmo assim (visita técnica, entrega de brinde) marca true.

-- Snapshot no pedido, pelo mesmo motivo de `items` e `shipping_*`: o
-- `requires_shipping` do produto pode mudar depois da compra, e um pedido
-- antigo não pode passar a cobrar (ou deixar de cobrar) endereço
-- retroativamente. Default true preserva o histórico: tudo vendido até aqui
-- era físico.
alter table public.store_orders
  add column if not exists requires_shipping_address boolean not null default true;

-- A fila operacional "pagos que ainda não têm endereço" precisa ignorar os
-- pedidos que nunca vão ter um (serviços). Sem isso o admin vê para sempre
-- uma mentoria parada esperando um CEP que não existe.
drop index if exists store_orders_missing_shipping_idx;
create index if not exists store_orders_missing_shipping_idx
  on public.store_orders (created_at desc)
  where shipping_address_filled_at is null
    and requires_shipping_address
    and status in ('paid', 'awaiting_shipping_info');

comment on column public.store_products.requires_shipping is
  'Produto exige endereço de entrega. false = serviço/digital: o checkout não pede endereço e o pedido não entra na fila de "falta endereço".';
comment on column public.store_orders.requires_shipping_address is
  'Snapshot de requires_shipping do carrinho na hora da compra.';
