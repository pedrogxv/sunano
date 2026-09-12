-- Libera o checkout para compradores sem conta (guest checkout). Pedidos de
-- convidado não têm user_id em metadata, então a posse é provada por um
-- token opaco gerado no servidor no momento da criação do pedido — nunca
-- reexibido depois, comparado com timingSafeEqual em /api/store/orders/[id].
alter table store_orders
  add column if not exists access_token text;

create unique index if not exists store_orders_access_token_key
  on store_orders (access_token)
  where access_token is not null;
