-- Complemento de Pagamento (ver lib/store-payment-complement.ts).
--
-- Xianyu Express e Expert Buy são vendidos pelo valor da consulta; o preço
-- do produto que o cliente quer só sai depois do orçamento. O admin grava no
-- pedido quanto falta (`complement_due_cents`, acumulado) e o cliente paga
-- pelo anúncio "Complemento de Pagamento", digitando o número do pedido.
--
-- O pagamento é um pedido próprio (`complement_for_order_id` aponta o
-- original): passa pelos mesmos webhooks, estorno e painel de qualquer compra,
-- e o pendente é DERIVADO desses pedidos (soma dos pagos menos o estornado),
-- nunca um contador gravado à parte que um caminho de pagamento esqueceria.
--
-- Sem grant novo: `store_products` já é conteúdo público (a coluna é só a
-- marca do anúncio) e `store_orders` não tem leitura de cliente.

-- ---------------------------------------------------------------------------
-- Anúncio
-- ---------------------------------------------------------------------------

alter table public.store_products
  add column if not exists is_payment_complement boolean not null default false;

-- Um anúncio só: a página de Meus Pedidos e o checkout procuram "o" complemento.
create unique index if not exists store_products_single_payment_complement
  on public.store_products ((true))
  where is_payment_complement;

-- `price_cents` é só o mínimo que a tabela exige (>= 600): o checkout cobra o
-- pendente do pedido, nunca este valor. Sem foto (o dono sobe depois) e sem
-- entrega. Categoria `services` = preço único no PIX e no cartão.
insert into public.store_products (
  slug, name, description, price_cents, images, type, category, condition,
  sale_type, stock, requires_shipping, is_active, is_payment_complement
)
values (
  'complemento-de-pagamento',
  'Complemento de Pagamento',
  E'Use este anúncio para pagar o valor que falta de um pedido já feito no site: o orçamento de um Xianyu Express ou de uma consulta Expert Buy, ou um complemento que a equipe pediu em outro pedido.\n\nComo funciona:\n1. Em Meus Pedidos, copie o número do pedido (ex: #A1B2C3D4).\n2. Cole o número aqui e confira o valor pendente.\n3. Pague no PIX ou no cartão. O valor entra no pedido original assim que o pagamento é confirmado.\n\nO valor cobrado é o que a equipe definiu no seu pedido.',
  600,
  '{}',
  'store',
  'services',
  'new',
  'normal',
  null,
  false,
  true,
  true
)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Pedido
-- ---------------------------------------------------------------------------

alter table public.store_orders
  add column if not exists complement_due_cents integer,
  add column if not exists complement_note text,
  add column if not exists complement_for_order_id uuid;

alter table public.store_orders
  drop constraint if exists store_orders_complement_due_cents_check;
alter table public.store_orders
  add constraint store_orders_complement_due_cents_check
  check (complement_due_cents is null or complement_due_cents > 0);

alter table public.store_orders
  drop constraint if exists store_orders_complement_note_check;
alter table public.store_orders
  add constraint store_orders_complement_note_check
  check (complement_note is null or char_length(complement_note) <= 300);

-- `restrict`: apagar o pedido original apagaria a explicação de um pagamento.
alter table public.store_orders
  drop constraint if exists store_orders_complement_for_order_id_fkey;
alter table public.store_orders
  add constraint store_orders_complement_for_order_id_fkey
  foreign key (complement_for_order_id) references public.store_orders(id) on delete restrict;

alter table public.store_orders
  drop constraint if exists store_orders_complement_not_self_check;
alter table public.store_orders
  add constraint store_orders_complement_not_self_check
  check (complement_for_order_id is distinct from id);

create index if not exists store_orders_complement_for_order_id_idx
  on public.store_orders (complement_for_order_id)
  where complement_for_order_id is not null;

-- Um complemento aguardando pagamento por pedido. O checkout já recusa o
-- segundo; o índice fecha a corrida de dois cliques simultâneos, que pagos
-- os dois cobrariam o pendente em dobro.
create unique index if not exists store_orders_one_pending_complement
  on public.store_orders (complement_for_order_id)
  where status = 'pending' and complement_for_order_id is not null;

-- ---------------------------------------------------------------------------
-- Formulário pós-compra da consulta Expert Buy
-- ---------------------------------------------------------------------------
-- Pedido do dono (16/10/2026): produto mais específico ou que o cliente não
-- achou o link. Só preenche se o admin ainda não definiu campos.

update public.store_products
set service_form_fields = '[
  {"id": "nome-produto", "label": "Nome do produto", "type": "text", "required": true, "placeholder": "Ex: Wooting 80HE", "options": []},
  {"id": "foto", "label": "Foto do produto", "type": "image", "required": true, "placeholder": "Print ou foto de referência do produto.", "options": []},
  {"id": "cor-modelo", "label": "Cor e modelo", "type": "text", "required": true, "placeholder": "Ex: Branco, switch Lekker V2", "options": []},
  {"id": "link", "label": "Link do produto", "type": "url", "required": false, "placeholder": "Se tiver, cole o link: ajuda a achar mais rápido", "options": []},
  {"id": "condicao", "label": "Prefere novo ou seminovo?", "type": "choice", "required": true, "placeholder": "Pode marcar os dois.", "options": ["Novo", "Seminovo"]}
]'::jsonb
where slug = 'consulta-para-importacao'
  and service_form_fields = '[]'::jsonb;
