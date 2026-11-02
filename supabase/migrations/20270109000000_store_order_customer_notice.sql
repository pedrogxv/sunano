-- Aviso da loja ao cliente sobre um pedido: dado errado ou faltando que só
-- ele pode corrigir (CPF de quem recebe, endereço, celular...) ou um problema
-- que ele precisa saber. O admin envia pela fila de pedidos; o cliente
-- recebe e-mail + notificação e vê o aviso no card do pedido em "Meus
-- Pedidos", com o botão para corrigir.
--
-- Colunas, não tabela: é UM aviso aberto por pedido (mandar outro substitui
-- o anterior), lido junto com a linha nas duas filas. O histórico de quem
-- mandou o quê fica em `store_admin_audit_log` (`order.customer_notice`).
--
--   • `customer_notice_sent_at` nulo = o pedido nunca teve aviso;
--   • `customer_notice_resolved_at` nulo = o aviso está aberto e o pedido
--     espera o cliente;
--   • `customer_notice_resolved_by` diz quem fechou: `customer` (salvou os
--     dados de entrega de novo, ver `setOrderShippingAddress`) ou `admin`.
--
-- Os motivos espelham `ORDER_NOTICE_REASONS` em `lib/order-customer-notice.ts`.
--
-- Colunas novas em `store_orders` não ganham grant para anon/authenticated:
-- leitura e escrita passam pelas rotas com service_role.

alter table public.store_orders
  add column if not exists customer_notice_reason      text,
  add column if not exists customer_notice_message     text,
  add column if not exists customer_notice_sent_at     timestamptz,
  add column if not exists customer_notice_resolved_at timestamptz,
  add column if not exists customer_notice_resolved_by text;

alter table public.store_orders
  drop constraint if exists store_orders_customer_notice_reason_check;
alter table public.store_orders
  add constraint store_orders_customer_notice_reason_check
  check (customer_notice_reason is null or customer_notice_reason in (
    'cpf', 'recipient', 'birth_date', 'address', 'phone', 'other'
  ));

alter table public.store_orders
  drop constraint if exists store_orders_customer_notice_message_check;
alter table public.store_orders
  add constraint store_orders_customer_notice_message_check
  check (customer_notice_message is null or char_length(customer_notice_message) <= 1000);

alter table public.store_orders
  drop constraint if exists store_orders_customer_notice_resolved_by_check;
alter table public.store_orders
  add constraint store_orders_customer_notice_resolved_by_check
  check (customer_notice_resolved_by is null or customer_notice_resolved_by in ('customer', 'admin'));

-- Contagem do badge de "Meus Pedidos" na TopBar (`countOpenOrderNoticesByUser`),
-- que roda em toda resolução de sessão: só as linhas com aviso aberto.
create index if not exists store_orders_open_customer_notice_idx
  on public.store_orders ((metadata->>'user_id'))
  where customer_notice_sent_at is not null and customer_notice_resolved_at is null;

comment on column public.store_orders.customer_notice_reason is
  'Motivo do aviso da loja ao cliente (lib/order-customer-notice.ts). Nulo = nunca houve aviso.';
comment on column public.store_orders.customer_notice_sent_at is
  'Quando o admin mandou o aviso atual ao cliente. Mandar outro substitui o anterior.';
comment on column public.store_orders.customer_notice_resolved_at is
  'Quando o aviso foi resolvido. Nulo com sent_at preenchido = aviso aberto, esperando o cliente.';
