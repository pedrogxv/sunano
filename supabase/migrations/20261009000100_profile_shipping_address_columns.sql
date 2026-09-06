-- Separa endereço de ENTREGA do endereço de COBRANÇA no perfil.
--
-- Até aqui os dois compartilhavam as mesmas colunas (`phone`, `postal_code`,
-- `street`, …), e o checkout gravava nelas nos dois casos. Quem comprava para
-- presentear tinha o endereço do presenteado gravado como seu endereço de
-- cobrança — e ele voltava pré-preenchido na próxima compra, indo para a
-- Asaas como endereço do titular do cartão.
--
-- As colunas antigas continuam sendo o endereço de COBRANÇA (é o que a Asaas
-- exige no customer, e o que já está lá é majoritariamente isso). As novas
-- guardam só a última ENTREGA, para pré-preencher o card de entrega.
--
-- Nada aqui muda o snapshot gravado no pedido (`store_orders.shipping_*`),
-- que já estava correto: é ele que vale para despachar.

alter table public.user_profiles
  add column if not exists shipping_recipient text,
  add column if not exists shipping_phone text,
  add column if not exists shipping_postal_code text,
  add column if not exists shipping_street text,
  add column if not exists shipping_number text,
  add column if not exists shipping_complement text,
  add column if not exists shipping_neighborhood text,
  add column if not exists shipping_city text,
  add column if not exists shipping_state text;

comment on column public.user_profiles.shipping_postal_code is
  'Último endereço de ENTREGA usado, só para pré-preencher o checkout. O endereço de cobrança (exigido pela Asaas no cartão) segue em postal_code/street/number/...';

-- Semente: para quem já comprou com entrega, o último endereço de entrega
-- conhecido é o snapshot do pedido mais recente que tem um. Sem isto, todo
-- cliente existente veria o card de entrega vazio na próxima compra, mesmo
-- tendo endereço salvo.
update public.user_profiles p
set shipping_recipient = o.shipping_recipient,
    shipping_phone = o.shipping_phone,
    shipping_postal_code = o.shipping_postal_code,
    shipping_street = o.shipping_street,
    shipping_number = o.shipping_number,
    shipping_complement = o.shipping_complement,
    shipping_neighborhood = o.shipping_neighborhood,
    shipping_city = o.shipping_city,
    shipping_state = o.shipping_state
from (
  select distinct on (metadata->>'user_id')
    metadata->>'user_id' as user_id,
    shipping_recipient, shipping_phone, shipping_postal_code, shipping_street,
    shipping_number, shipping_complement, shipping_neighborhood,
    shipping_city, shipping_state
  from public.store_orders
  where shipping_address_filled_at is not null
    and metadata->>'user_id' is not null
  order by metadata->>'user_id', shipping_address_filled_at desc
) o
where p.id = o.user_id::uuid
  and p.shipping_postal_code is null;
