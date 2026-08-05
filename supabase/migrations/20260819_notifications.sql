-- Sistema de notificações do usuário. Uma linha por aviso entregue a alguém
-- (`user_id` é sempre o DESTINATÁRIO, nunca quem causou o evento — esse é o
-- `actor_id`). O texto exibido NÃO é gravado aqui: o front-end monta a frase
-- a partir de `type` + `actor_name` + `amount`, senão as notificações
-- antigas ficariam congeladas no idioma em que foram criadas. A exceção é
-- 'system', que carrega `title`/`body` próprios porque não há template.
--
-- Origem de cada tipo (todos por trigger, nada depende do app lembrar de
-- chamar):
--   aura_received  ← insert em aura_ledger com delta > 0
--   post_comment   ← comentário raiz em forum_comments / blog_comments
--   comment_reply  ← comentário com parent_comment_id
--   new_follower   ← insert em user_follows
--   system         ← inserido à mão (service role), sem trigger

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in (
                'aura_received', 'post_comment', 'comment_reply', 'new_follower', 'system'
              )),
  -- Quem causou. Null em aura de bônus próprio (criar post/comentário) e em 'system'.
  actor_id    uuid references auth.users(id) on delete set null,
  -- Snapshot do nome na hora do evento: o dropdown não faz join, e se o
  -- usuário trocar de nome depois a notificação antiga continua legível.
  actor_name  text,
  entity_type text check (entity_type in (
                'forum_post', 'forum_comment', 'blog_post', 'blog_comment', 'user'
              )),
  entity_id   uuid,
  link        text,
  title       text,
  body        text,
  amount      integer,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Listagem do painel (mais recentes primeiro).
create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

-- Badge do sino: só conta não lidas, então o índice parcial é bem menor que
-- o composto acima e serve exatamente essa query.
create index if not exists idx_notifications_user_unread
  on public.notifications (user_id) where not is_read;

-- ────────────────────────────────────────────
-- Anti-spam
-- ────────────────────────────────────────────
-- Aura é um toggle: dar/tirar/dar de novo gera várias linhas em aura_ledger.
-- Sem isso, o autor recebe uma notificação por clique. Uma notificação por
-- (destinatário, quem deu, alvo) basta — o `coalesce` cobre o bônus próprio,
-- onde actor_id é null (em índice único, NULLs seriam todos distintos).
create unique index if not exists uniq_notifications_aura_once
  on public.notifications (
    user_id,
    coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid),
    entity_type,
    entity_id
  )
  where type = 'aura_received';

-- Mesma lógica para seguir/deixar de seguir/seguir de novo.
create unique index if not exists uniq_notifications_follow_once
  on public.notifications (user_id, actor_id)
  where type = 'new_follower';

alter table public.notifications enable row level security;

-- Ninguém insere pelo PostgREST: só as triggers (SECURITY DEFINER) e o
-- service role, que ignora RLS. Ler/marcar como lida/apagar é só do dono.
drop policy if exists "Users read their own notifications" on public.notifications;
create policy "Users read their own notifications"
  on public.notifications for select using (auth.uid() = user_id);

drop policy if exists "Users update their own notifications" on public.notifications;
create policy "Users update their own notifications"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete their own notifications" on public.notifications;
create policy "Users delete their own notifications"
  on public.notifications for delete using (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- Helper central de insert
-- ────────────────────────────────────────────
-- Todas as triggers passam por aqui. O `on conflict do nothing` casa com os
-- índices únicos parciais acima, e o bloco `exception` garante que uma falha
-- ao notificar jamais derrube a operação que a originou (comentar, seguir,
-- dar aura). Notificação é best-effort; o dado principal não é.
create or replace function public.push_notification(
  p_user_id     uuid,
  p_type        text,
  p_actor_id    uuid    default null,
  p_actor_name  text    default null,
  p_entity_type text    default null,
  p_entity_id   uuid    default null,
  p_link        text    default null,
  p_title       text    default null,
  p_body        text    default null,
  p_amount      integer default null
) returns void
language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id is null then return; end if;
  -- Ninguém precisa ser avisado do que fez a si mesmo.
  if p_actor_id is not null and p_actor_id = p_user_id then return; end if;

  insert into public.notifications (
    user_id, type, actor_id, actor_name, entity_type, entity_id, link, title, body, amount
  ) values (
    p_user_id, p_type, p_actor_id, p_actor_name, p_entity_type, p_entity_id,
    p_link, p_title, p_body, p_amount
  )
  on conflict do nothing;
exception when others then
  raise warning 'push_notification falhou (%): %', p_type, sqlerrm;
end;
$$;

revoke execute on function public.push_notification(uuid, text, uuid, text, text, uuid, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.push_notification(uuid, text, uuid, text, text, uuid, text, text, text, integer)
  to service_role;

/** Nome de exibição para o snapshot em `actor_name`. */
create or replace function public.notification_actor_name(p_user_id uuid)
returns text
language sql stable security definer
set search_path = public as $$
  select coalesce(display_name, 'Alguém') from public.user_profiles where id = p_user_id;
$$;

-- ────────────────────────────────────────────
-- Aura farmada
-- ────────────────────────────────────────────
-- Só delta positivo: remoção de aura (delta < 0) e resgate de medalha
-- ('event_medal_redeemed', também negativo) não viram aviso.
create or replace function public.trg_notify_aura_received()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_entity_type text;
  v_entity_id   uuid;
  v_slug        text;
  v_link        text;
begin
  if new.delta is null or new.delta <= 0 then return new; end if;

  if new.source_post_id is not null then
    v_entity_type := 'forum_post';
    v_entity_id   := new.source_post_id;
    select slug into v_slug from public.forum_posts where id = new.source_post_id;
    if v_slug is not null then v_link := '/forum/' || v_slug; end if;

  elsif new.source_comment_id is not null then
    v_entity_type := 'forum_comment';
    v_entity_id   := new.source_comment_id;
    select p.slug into v_slug
      from public.forum_comments c
      join public.forum_posts p on p.id = c.post_id
     where c.id = new.source_comment_id;
    if v_slug is not null then v_link := '/forum/' || v_slug; end if;

  elsif new.source_blog_post_id is not null then
    v_entity_type := 'blog_post';
    v_entity_id   := new.source_blog_post_id;
    select slug into v_slug from public.blog_posts where id = new.source_blog_post_id;
    if v_slug is not null then v_link := '/blog/' || v_slug; end if;

  elsif new.source_blog_comment_id is not null then
    v_entity_type := 'blog_comment';
    v_entity_id   := new.source_blog_comment_id;
    select p.slug into v_slug
      from public.blog_comments c
      join public.blog_posts p on p.id = c.post_id
     where c.id = new.source_blog_comment_id;
    if v_slug is not null then v_link := '/blog/' || v_slug; end if;
  end if;

  perform public.push_notification(
    p_user_id     => new.user_id,
    p_type        => 'aura_received',
    p_actor_id    => new.giver_id,
    p_actor_name  => case when new.giver_id is not null
                          then public.notification_actor_name(new.giver_id) end,
    p_entity_type => v_entity_type,
    p_entity_id   => v_entity_id,
    p_link        => v_link,
    p_amount      => new.delta
  );

  return new;
end;
$$;

drop trigger if exists trg_aura_ledger_notify on public.aura_ledger;
create trigger trg_aura_ledger_notify
  after insert on public.aura_ledger
  for each row execute function public.trg_notify_aura_received();

-- ────────────────────────────────────────────
-- Comentário no post / resposta a comentário (fórum)
-- ────────────────────────────────────────────
create or replace function public.trg_notify_forum_comment()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_target uuid;
  v_type   text;
  v_slug   text;
begin
  if new.user_id is null or new.is_hidden then return new; end if;

  if new.parent_comment_id is null then
    v_type := 'post_comment';
    select user_id into v_target from public.forum_posts where id = new.post_id;
  else
    v_type := 'comment_reply';
    select user_id into v_target from public.forum_comments where id = new.parent_comment_id;
  end if;

  if v_target is null then return new; end if;

  select slug into v_slug from public.forum_posts where id = new.post_id;

  perform public.push_notification(
    p_user_id     => v_target,
    p_type        => v_type,
    p_actor_id    => new.user_id,
    p_actor_name  => coalesce(new.author_name, public.notification_actor_name(new.user_id)),
    p_entity_type => 'forum_comment',
    p_entity_id   => new.id,
    p_link        => case when v_slug is not null then '/forum/' || v_slug end,
    p_body        => coalesce(new.body_preview, left(new.body, 140))
  );

  return new;
end;
$$;

drop trigger if exists trg_forum_comments_notify on public.forum_comments;
create trigger trg_forum_comments_notify
  after insert on public.forum_comments
  for each row execute function public.trg_notify_forum_comment();

-- ────────────────────────────────────────────
-- Comentário / resposta em notícia (blog)
-- ────────────────────────────────────────────
create or replace function public.trg_notify_blog_comment()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_target uuid;
  v_type   text;
  v_slug   text;
begin
  if new.user_id is null or new.is_hidden then return new; end if;

  if new.parent_comment_id is null then
    v_type := 'post_comment';
    select author_id into v_target from public.blog_posts where id = new.post_id;
  else
    v_type := 'comment_reply';
    select user_id into v_target from public.blog_comments where id = new.parent_comment_id;
  end if;

  if v_target is null then return new; end if;

  select slug into v_slug from public.blog_posts where id = new.post_id;

  perform public.push_notification(
    p_user_id     => v_target,
    p_type        => v_type,
    p_actor_id    => new.user_id,
    p_actor_name  => coalesce(new.author_name, public.notification_actor_name(new.user_id)),
    p_entity_type => 'blog_comment',
    p_entity_id   => new.id,
    p_link        => case when v_slug is not null then '/blog/' || v_slug end,
    p_body        => coalesce(new.body_preview, left(new.body, 140))
  );

  return new;
end;
$$;

drop trigger if exists trg_blog_comments_notify on public.blog_comments;
create trigger trg_blog_comments_notify
  after insert on public.blog_comments
  for each row execute function public.trg_notify_blog_comment();

-- ────────────────────────────────────────────
-- Novo seguidor
-- ────────────────────────────────────────────
create or replace function public.trg_notify_new_follower()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_name text;
  v_slug text;
begin
  select display_name, display_slug into v_name, v_slug
    from public.user_profiles where id = new.follower_id;

  perform public.push_notification(
    p_user_id     => new.following_id,
    p_type        => 'new_follower',
    p_actor_id    => new.follower_id,
    p_actor_name  => coalesce(v_name, 'Alguém'),
    p_entity_type => 'user',
    p_entity_id   => new.follower_id,
    p_link        => '/perfil/' || coalesce(v_slug, new.follower_id::text)
  );

  return new;
end;
$$;

drop trigger if exists trg_user_follows_notify on public.user_follows;
create trigger trg_user_follows_notify
  after insert on public.user_follows
  for each row execute function public.trg_notify_new_follower();

-- ────────────────────────────────────────────
-- Avisos do sistema
-- ────────────────────────────────────────────
-- Sem trigger: é disparado à mão pelo service role. `p_user_id => null`
-- envia para todo mundo (broadcast). Os índices únicos parciais só cobrem
-- aura e follow, então avisos repetidos são permitidos de propósito.
create or replace function public.broadcast_system_notification(
  p_title   text,
  p_body    text,
  p_link    text default null,
  p_user_id uuid default null
) returns integer
language plpgsql security definer
set search_path = public as $$
declare
  v_count integer;
begin
  if p_user_id is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (p_user_id, 'system', p_title, p_body, p_link);
    return 1;
  end if;

  insert into public.notifications (user_id, type, title, body, link)
  select id, 'system', p_title, p_body, p_link from public.user_profiles;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.broadcast_system_notification(text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.broadcast_system_notification(text, text, text, uuid)
  to service_role;
