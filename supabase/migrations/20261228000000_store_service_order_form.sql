-- Formulário pós-compra de serviço (ver lib/store-service-form.ts).
--
-- `store_products.service_form_fields`: os campos que o admin define no
-- produto de serviço (Xianyu Express: nome do produto, link, cor e modelo).
-- O checkout tira um snapshot deles no item do pedido (`items[].service_form`),
-- então mudar o produto depois não muda o que um pedido pago pede.
--
-- `store_orders.service_form_answers`: o que o comprador preencheu. Coluna
-- própria, não `metadata`: o webhook regrava o metadata inteiro
-- (`openServiceOrderTicket` faz read-modify-write), e uma resposta enviada no
-- mesmo instante sumiria. Null = ainda não preenchido.
--
-- Sem grant novo: `store_products` já é conteúdo público (os campos são só
-- rótulos do formulário) e `store_orders` não tem leitura de cliente.

alter table public.store_products
  add column if not exists service_form_fields jsonb not null default '[]'::jsonb;

alter table public.store_orders
  add column if not exists service_form_answers jsonb;

alter table public.store_products
  drop constraint if exists store_products_service_form_fields_array;
alter table public.store_products
  add constraint store_products_service_form_fields_array
  check (jsonb_typeof(service_form_fields) = 'array' and jsonb_array_length(service_form_fields) <= 10);
