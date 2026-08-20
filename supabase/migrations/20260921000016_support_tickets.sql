-- Sistema de tickets de suporte. Modelo ticket + mensagens (não um campo
-- único), porque suporte é uma conversa, não uma denúncia de um clique
-- (comparar com forum_reports.sql). Todo acesso passa pelo
-- createSupabaseAdminClient (service role) nos repositórios — RLS aqui é
-- defesa em profundidade, não a única barreira (ver ARQUITETURA.md).
--
-- Design para alta escala / baixo custo de infra:
--   - waiting_on, last_message_at, last_message_preview, last_message_sender
--     e message_count são denormalizados em support_tickets e mantidos por
--     trigger no insert de support_messages. A fila do admin e "Meus
--     Tickets" são um SELECT liso, sem join nem subquery de agregação por
--     linha.
--   - A regra "usuário só manda 1 mensagem por vez sem resposta" é uma
--     trigger BEFORE INSERT que barra no banco (raise P0001), em vez de um
--     SELECT COUNT/scan por requisição — mesmo padrão de
--     enforce_variant_group_limit em 20260921000014_store_variant_groups.sql.
--   - Índices compostos (status, last_message_at desc) pra fila do admin e
--     (user_id, created_at desc) pra "meus tickets", nada de full scan.

create table if not exists public.support_tickets (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,

  subject               text not null check (char_length(subject) between 3 and 140),

  -- Vínculos opcionais informados na abertura — nunca obrigatórios.
  -- product_id aponta pro produto da loja (store_products), não pra wiki
  -- (peripherals) — o que importa aqui é o que foi efetivamente comprado.
  order_id              uuid references public.store_orders(id) on delete set null,
  product_id            uuid references public.store_products(id) on delete set null,

  status                text not null default 'open'
                          check (status in ('open', 'resolved', 'cancelled')),

  -- Estado de quem deve responder — mantido só pela trigger abaixo, nunca
  -- escrito direto por repositório. 'closed' quando status sai de 'open'.
  waiting_on            text not null default 'admin'
                          check (waiting_on in ('user', 'admin', 'closed')),

  -- Denormalizado a partir de support_messages (trigger). Elimina
  -- COUNT/MAX/subquery por linha na listagem.
  message_count         integer not null default 0,
  last_message_at       timestamptz not null default now(),
  last_message_preview  text,
  -- Quem mandou a última mensagem — usado pela UI direto do flat select,
  -- sem reconsultar support_messages.
  last_message_sender   text check (last_message_sender in ('user', 'admin')),

  -- Avaliação de satisfação — só preenchida depois do fechamento.
  rating                smallint check (rating between 1 and 5),
  rating_comment        text check (rating_comment is null or char_length(rating_comment) <= 500),
  rated_at              timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  closed_at             timestamptz,
  closed_by             uuid references auth.users(id) on delete set null,

  constraint support_tickets_rating_only_when_closed check (
    rating is null or status in ('resolved', 'cancelled')
  )
);

-- Fila do admin: filtra por status, ordena pelas conversas mais recentes.
create index if not exists idx_support_tickets_status_last_message
  on public.support_tickets (status, last_message_at desc);

-- Fila "precisa de resposta do admin" (badge da sidebar) — índice parcial,
-- bem menor que o composto acima, cobre exatamente essa contagem.
create index if not exists idx_support_tickets_waiting_admin
  on public.support_tickets (last_message_at desc) where waiting_on = 'admin' and status = 'open';

-- "Meus tickets".
create index if not exists idx_support_tickets_user_created
  on public.support_tickets (user_id, created_at desc);

-- Contagem "meus tickets aguardando minha resposta" (badge amber no sino e em
-- "Meus Tickets") — índice parcial por usuário, mesmo raciocínio do índice
-- acima para o admin.
create index if not exists idx_support_tickets_user_waiting
  on public.support_tickets (user_id) where waiting_on = 'user' and status = 'open';

-- Cap de tickets abertos simultâneos por usuário (ver enforcement no
-- repositório) — índice parcial acelera o COUNT de pré-checagem.
create index if not exists idx_support_tickets_user_open
  on public.support_tickets (user_id) where status = 'open';

create table if not exists public.support_messages (
  id             uuid primary key default gen_random_uuid(),
  ticket_id      uuid not null references public.support_tickets(id) on delete cascade,
  sender_type    text not null check (sender_type in ('user', 'admin')),
  -- Sempre o auth.users.id de quem escreveu — usuário dono do ticket ou
  -- admin autenticado. Nunca null: mensagem de sistema não existe aqui.
  sender_id      uuid not null references auth.users(id) on delete cascade,
  -- Snapshot do nome exibido, mesmo motivo de author_name em forum_comments:
  -- não fazer join pra exibir a thread, e sobreviver a troca de nome depois.
  sender_name    text not null,
  body           text not null check (char_length(body) between 1 and 4000),
  -- Até 3 imagens por mensagem — teto de custo de storage/egress (ver
  -- lib/server/support-media.ts). Vazio na maioria das mensagens.
  image_urls     text[] not null default '{}',
  created_at     timestamptz not null default now(),

  constraint support_messages_image_urls_limit
    check (array_length(image_urls, 1) is null or array_length(image_urls, 1) <= 3)
);

-- Carregar a thread de um ticket, em ordem cronológica — o único padrão de
-- leitura desta tabela.
create index if not exists idx_support_messages_ticket_created
  on public.support_messages (ticket_id, created_at asc);

comment on column public.support_tickets.order_id is
  'Pedido citado pelo usuário ao abrir o ticket, opcional. on delete set null preserva o ticket se o pedido for removido.';
comment on column public.support_tickets.product_id is
  'Produto da loja (store_products) citado pelo usuário, opcional — não referencia a wiki (peripherals).';

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- Leitura/escrita real acontece via service role no repositório. Policies
-- aqui só fecham o PostgREST por padrão e cobrem o caso de algum client
-- futuro bater direto no Supabase — dono só vê/insere o próprio.
drop policy if exists "Users read their own tickets" on public.support_tickets;
create policy "Users read their own tickets"
  on public.support_tickets for select using (auth.uid() = user_id);

drop policy if exists "Users insert their own ticket" on public.support_tickets;
create policy "Users insert their own ticket"
  on public.support_tickets for insert with check (auth.uid() = user_id);

drop policy if exists "Users read messages of their own tickets" on public.support_messages;
create policy "Users read messages of their own tickets"
  on public.support_messages for select
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "Users insert messages on their own tickets" on public.support_messages;
create policy "Users insert messages on their own tickets"
  on public.support_messages for insert
  with check (
    sender_type = 'user'
    and sender_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────
-- Trigger: barra a 2ª mensagem consecutiva do usuário sem resposta do admin,
-- e barra mensagem em ticket fechado.
-- ────────────────────────────────────────────
create or replace function public.enforce_support_message_turn()
returns trigger language plpgsql as $$
declare
  v_status text;
  v_waiting_on text;
begin
  select status, waiting_on into v_status, v_waiting_on
    from public.support_tickets where id = new.ticket_id
    for update; -- trava a linha do ticket até o fim da transação, evita corrida
                -- entre duas mensagens do mesmo usuário chegando quase juntas

  if v_status is null then
    raise exception 'Ticket não encontrado.' using errcode = 'P0001';
  end if;

  if v_status <> 'open' then
    raise exception 'Este ticket está encerrado e não aceita novas mensagens.' using errcode = 'P0001';
  end if;

  if new.sender_type = 'user' and v_waiting_on = 'user' then
    raise exception 'Aguarde a resposta do suporte antes de enviar outra mensagem.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_support_messages_turn on public.support_messages;
create trigger trg_support_messages_turn
  before insert on public.support_messages
  for each row execute function public.enforce_support_message_turn();

create or replace function public.support_messages_after_insert()
returns trigger language plpgsql as $$
begin
  update public.support_tickets set
    message_count        = message_count + 1,
    last_message_at      = new.created_at,
    last_message_preview = left(new.body, 140),
    last_message_sender  = new.sender_type,
    waiting_on           = case when new.sender_type = 'user' then 'admin' else 'user' end,
    updated_at            = now()
  where id = new.ticket_id;

  return new;
end;
$$;

drop trigger if exists trg_support_messages_after_insert on public.support_messages;
create trigger trg_support_messages_after_insert
  after insert on public.support_messages
  for each row execute function public.support_messages_after_insert();

-- ────────────────────────────────────────────
-- updated_at automático em qualquer UPDATE direto na tabela (fechamento,
-- avaliação) — a trigger de mensagem já seta updated_at manualmente, esta
-- cobre os demais caminhos (ex.: closeSupportTicket, rateSupportTicket).
-- ────────────────────────────────────────────
create or replace function public.support_tickets_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_support_tickets_touch on public.support_tickets;
create trigger trg_support_tickets_touch
  before update on public.support_tickets
  for each row execute function public.support_tickets_touch_updated_at();

-- ────────────────────────────────────────────
-- Storage — bucket dedicado `support`
-- ────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support', 'support', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Usuário sobe/apaga só arquivos com o próprio uid no nome
-- (support-<uid>-*). Admin sobe com o próprio uid também
-- (support-admin-<uid>-*) — ver lib/server/support-media.ts.
drop policy if exists "Support images upload access" on storage.objects;
create policy "Support images upload access"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'support'
  and (name like 'support-' || auth.uid()::text || '-%' or name like 'support-admin-' || auth.uid()::text || '-%')
);

drop policy if exists "Support images delete access" on storage.objects;
create policy "Support images delete access"
on storage.objects for delete to authenticated
using (
  bucket_id = 'support'
  and (name like 'support-' || auth.uid()::text || '-%' or name like 'support-admin-' || auth.uid()::text || '-%')
);

-- ────────────────────────────────────────────
-- Notificação: usuário é avisado quando o admin responde; admins com
-- support_read são avisados quando um ticket é aberto ou o usuário responde.
-- Reemite os checks em vez de editar as migrations já aplicadas, mesmo padrão
-- usado por 20260825_comment_images_and_mentions.sql para estender o mesmo
-- constraint com 'mention'.
-- ────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'aura_received', 'post_comment', 'comment_reply', 'new_follower', 'system', 'mention',
  'new_post', 'order_status', 'support_reply', 'support_new_ticket', 'support_user_reply'
));

alter table public.notifications drop constraint if exists notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check check (entity_type in (
  'forum_post', 'forum_comment', 'blog_post', 'blog_comment', 'user', 'peripheral', 'order', 'support_ticket'
));

create or replace function public.trg_notify_support_reply()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_owner_id uuid;
begin
  if new.sender_type <> 'admin' then return new; end if;

  select user_id into v_owner_id from public.support_tickets where id = new.ticket_id;
  if v_owner_id is null then return new; end if;

  perform public.push_notification(
    p_user_id     => v_owner_id,
    p_type        => 'support_reply',
    p_actor_id    => new.sender_id,
    p_actor_name  => new.sender_name,
    p_entity_type => 'support_ticket',
    p_entity_id   => new.ticket_id,
    p_link        => '/conta/suporte/' || new.ticket_id,
    p_body        => left(new.body, 140)
  );

  return new;
end;
$$;

drop trigger if exists trg_support_messages_notify on public.support_messages;
create trigger trg_support_messages_notify
  after insert on public.support_messages
  for each row execute function public.trg_notify_support_reply();

-- Avisa todo admin com support_read quando o usuário manda mensagem (a
-- primeira, na abertura do ticket, ou qualquer resposta seguinte) — nenhum
-- admin específico "dono" do ticket, então é fan-out pra todos que enxergam a
-- fila. `push_notification` já ignora p_actor_id = p_user_id, mas aqui o autor
-- (usuário) nunca é um admin, então essa guarda nunca dispara — mantida por
-- simetria com o helper.
create or replace function public.trg_notify_support_user_message()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_ticket record;
  v_is_new_ticket boolean;
  v_admin record;
begin
  if new.sender_type <> 'user' then return new; end if;

  select id, user_id, subject into v_ticket
    from public.support_tickets where id = new.ticket_id;
  if v_ticket.id is null then return new; end if;

  -- Conta direto em support_messages (não confiar na ordem entre triggers
  -- AFTER INSERT — o Postgres dispara por nome de trigger em ordem
  -- alfabética, não por ordem de criação, então support_tickets.message_count
  -- poderia já estar incrementado ou não dependendo do nome escolhido). Esta
  -- é a 1ª mensagem do ticket exatamente quando só existe esta linha.
  select count(*) = 1 into v_is_new_ticket
    from public.support_messages where ticket_id = new.ticket_id;

  for v_admin in
    select id from public.admin_profiles
    where role = 'webmaster' or coalesce((permissions ->> 'support_read')::boolean, false)
  loop
    perform public.push_notification(
      p_user_id     => v_admin.id,
      p_type        => case when v_is_new_ticket then 'support_new_ticket' else 'support_user_reply' end,
      p_actor_id    => new.sender_id,
      p_actor_name  => new.sender_name,
      p_entity_type => 'support_ticket',
      p_entity_id   => new.ticket_id,
      p_link        => '/admin/suporte/' || new.ticket_id,
      p_title       => v_ticket.subject,
      p_body        => left(new.body, 140)
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_support_messages_notify_admin on public.support_messages;
create trigger trg_support_messages_notify_admin
  after insert on public.support_messages
  for each row execute function public.trg_notify_support_user_message();
