-- Ponte entre um pedido da Loja e a thread do Discord que o acompanha.
--
-- Cada pedido ganha UMA thread no canal de pedidos, e todo evento de status
-- daquele pedido vira uma mensagem dentro dela — em vez de um mural único
-- onde eventos de pedidos diferentes se intercalam. Um canal por pedido foi
-- descartado: o Discord limita 500 canais por servidor (e ~50 por categoria),
-- então a loja quebraria sozinha depois de algumas centenas de vendas;
-- threads não têm esse teto e arquivam sozinhas.
--
-- Por que uma TABELA e não uma coluna em `store_orders`:
--   • o vínculo é de um sistema externo e opcional — a Loja funciona igual
--     com o Discord desligado, e nada em `store_orders` deve depender disso;
--   • guardamos também o id da mensagem-painel (`dashboard_message_id`) para
--     EDITAR sempre a mesma mensagem fixada em vez de empilhar cópias, e
--     `last_status`/`last_event_key` para deduplicar reentrega de webhook.
create table if not exists public.discord_order_threads (
  order_id             uuid        primary key references public.store_orders(id) on delete cascade,
  channel_id           text        not null,
  thread_id            text        not null,
  -- Mensagem "painel do pedido" dentro da thread, editada a cada evento.
  dashboard_message_id text,
  -- Último status publicado — evita repostar o mesmo evento quando a Asaas
  -- reentrega um webhook ou o admin clica duas vezes.
  last_status          text,
  -- Chave do último evento publicado (status + discriminador, ex.
  -- "refunded:parcial"). Mais fina que `last_status` para eventos que não
  -- mudam o status (chargeback, estorno parcial).
  last_event_key       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists discord_order_threads_thread_idx
  on public.discord_order_threads (thread_id);

-- Sem policy nenhuma + RLS ligado = só a service role (server-side) enxerga.
-- Nenhum client tem motivo para ler ids de thread do Discord.
alter table public.discord_order_threads enable row level security;

drop trigger if exists discord_order_threads_updated_at on public.discord_order_threads;
create trigger discord_order_threads_updated_at
  before update on public.discord_order_threads
  for each row execute function public.set_updated_at();
