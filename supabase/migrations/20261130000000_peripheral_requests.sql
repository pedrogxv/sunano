-- Pedidos de cadastro de periférico (formato ticket).
--
-- A pessoa não achou o periférico na wiki e pede o cadastro. Quem atende é a
-- equipe que já cadastra periférico (cargos com peripherals_write), por isso a
-- fila é própria e NÃO reaproveita support_tickets: aquela é atendida por
-- support_read (vendedor) e é toda em torno de pedido/produto da Loja, com
-- conversa e nota de satisfação. Aqui o ciclo é curto e tem um desfecho
-- concreto: virou uma ficha na wiki (peripheral_id) ou não virou (motivo).
--
-- Sem conversa de propósito: o formulário já pede marca, modelo, categoria e
-- link, que é o que a equipe precisaria perguntar. Faltou algo, recusa-se com
-- o motivo e a pessoa abre outro pedido.
--
-- Acesso: só as rotas do Next com service_role. Sem grant nem policy para
-- anon/authenticated (ver AGENTS.md, "Banco: cliente só lê conteúdo público").

create table if not exists public.peripheral_requests (
  id              uuid primary key default gen_random_uuid(),
  -- Número curto e sequencial para citar o pedido ("#0042").
  number          integer generated always as identity,
  user_id         uuid not null references auth.users(id) on delete cascade,

  category        text not null check (category in (
    'mouse', 'keyboard', 'pcb', 'mousepad', 'glasspad', 'iem', 'headset',
    'feet', 'chairs', 'monitors', 'switches', 'dac_amp', 'psu'
  )),
  -- Texto livre: a marca pode nem existir em `brands` ainda.
  brand_name      text not null check (char_length(btrim(brand_name)) between 1 and 80),
  model_name      text not null check (char_length(btrim(model_name)) between 2 and 120),
  reference_url   text check (
    reference_url is null
    or (char_length(reference_url) <= 500 and reference_url ~* '^https?://')
  ),
  notes           text check (notes is null or char_length(notes) <= 1000),

  status          text not null default 'pending'
                    check (status in ('pending', 'in_review', 'added', 'duplicate', 'rejected', 'cancelled')),
  -- Resposta da equipe, mostrada à pessoa. Obrigatória ao recusar (rota).
  staff_response  text check (staff_response is null or char_length(staff_response) <= 1000),
  -- Ficha resultante ("added") ou a que já existia ("duplicate"). set null:
  -- apagar a ficha não pode apagar o histórico do pedido.
  peripheral_id   uuid references public.peripherals(id) on delete set null,
  reviewed_by     uuid references auth.users(id) on delete set null,
  reviewed_at     timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Fila do painel: filtra por status, mais antigos primeiro dentro da fila.
create index if not exists idx_peripheral_requests_status_created
  on public.peripheral_requests (status, created_at);

-- "Meus pedidos".
create index if not exists idx_peripheral_requests_user_created
  on public.peripheral_requests (user_id, created_at desc);

-- Badge do painel: conta só o que espera a equipe.
create index if not exists idx_peripheral_requests_pending
  on public.peripheral_requests (created_at) where status = 'pending';

-- Não deixa a mesma pessoa abrir o mesmo periférico duas vezes enquanto o
-- primeiro pedido está na fila (duplo clique, retry de rota). A chave ignora
-- caixa, espaço e pontuação: "Logitech G Pro" e "logitech  g-pro" são o mesmo.
create unique index if not exists uniq_peripheral_requests_open_per_user
  on public.peripheral_requests (
    user_id,
    (lower(regexp_replace(brand_name || model_name, '[^[:alnum:]]+', '', 'g')))
  )
  where status in ('pending', 'in_review');

alter table public.peripheral_requests enable row level security;

-- Sem policy e sem grant: nenhum cliente lê nem escreve direto.
revoke all on public.peripheral_requests from public, anon, authenticated;

-- ────────────────────────────────────────────
-- Teto de pedidos em aberto por pessoa. No banco (e não só na rota) porque
-- é o único lugar onde dois envios quase simultâneos não furam o limite: o
-- advisory lock serializa por usuário até o fim da transação.
-- Espelha MAX_OPEN_PERIPHERAL_REQUESTS em lib/peripheral-requests.ts.
-- ────────────────────────────────────────────
create or replace function public.enforce_peripheral_request_cap()
returns trigger
language plpgsql
set search_path = public as $$
declare
  v_open integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('peripheral_requests:' || new.user_id::text, 0));

  select count(*) into v_open
    from public.peripheral_requests
    where user_id = new.user_id and status in ('pending', 'in_review');

  if v_open >= 5 then
    raise exception 'Você já tem 5 pedidos em aberto. Aguarde a análise de um deles ou cancele um antes de pedir outro.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_peripheral_requests_cap on public.peripheral_requests;
create trigger trg_peripheral_requests_cap
  before insert on public.peripheral_requests
  for each row execute function public.enforce_peripheral_request_cap();

create or replace function public.peripheral_requests_touch_updated_at()
returns trigger
language plpgsql
set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_peripheral_requests_touch on public.peripheral_requests;
create trigger trg_peripheral_requests_touch
  before update on public.peripheral_requests
  for each row execute function public.peripheral_requests_touch_updated_at();

revoke execute on function public.enforce_peripheral_request_cap() from public, anon, authenticated;
revoke execute on function public.peripheral_requests_touch_updated_at() from public, anon, authenticated;

-- ────────────────────────────────────────────
-- Notificação: quem pediu é avisado quando o status muda. Em trigger (não na
-- rota) para nenhum caminho novo de atualização esquecer de avisar — mesmo
-- motivo de trg_notify_support_status_change.
--
-- O check de `type` é reescrito inteiro (Postgres não tem `add value` para
-- check), com a lista atual de 20261123000000 mais o tipo novo. O de
-- `entity_type` segue 20261001000001.
-- ────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'aura_received', 'post_comment', 'comment_reply', 'new_follower', 'system', 'mention',
  'new_post', 'order_status', 'support_reply', 'support_new_ticket', 'support_user_reply',
  'support_status', 'store_restock', 'affiliate_payout', 'rank_frame',
  'peripheral_request_status'
));

alter table public.notifications drop constraint if exists notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check check (entity_type in (
  'forum_post', 'forum_comment', 'blog_post', 'blog_comment', 'user', 'peripheral', 'order',
  'support_ticket', 'store_product', 'affiliate_payout', 'peripheral_request'
));

create or replace function public.trg_notify_peripheral_request_status()
returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  if new.status = old.status then return new; end if;
  -- Quem cancelou foi a própria pessoa: não há o que avisar.
  if new.status = 'cancelled' then return new; end if;

  perform public.push_notification(
    p_user_id     => new.user_id,
    p_type        => 'peripheral_request_status',
    p_actor_id    => new.reviewed_by,
    p_entity_type => 'peripheral_request',
    p_entity_id   => new.id,
    p_link        => '/perifericos/pedidos/' || new.id,
    -- Marca + modelo: a frase da notificação cita o periférico pedido.
    p_title       => left(new.brand_name || ' ' || new.model_name, 200),
    p_body        => new.status
  );

  return new;
end;
$$;

drop trigger if exists trg_peripheral_requests_notify_status on public.peripheral_requests;
create trigger trg_peripheral_requests_notify_status
  after update on public.peripheral_requests
  for each row execute function public.trg_notify_peripheral_request_status();

revoke execute on function public.trg_notify_peripheral_request_status() from public, anon, authenticated;
