-- Notifica seguidores quando alguém que eles seguem cria um post no fórum
-- (só post raiz, comentários já têm seus próprios avisos). Diferente das
-- outras triggers, aqui o fan-out pode ser para muitos seguidores de uma vez
-- — em vez de um loop chamando push_notification por linha (overhead de
-- function call + exception handler por seguidor), faz um único insert
-- setorial com `select` a partir de user_follows.

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in (
    'aura_received', 'post_comment', 'comment_reply', 'new_follower', 'system', 'mention', 'new_post'
  ));

-- Um aviso de "novo post" por (destinatário, autor, post) — mesma lógica dos
-- outros dedups: sem isso, editar o post não deveria gerar outro, mas o
-- índice único também protege contra a trigger disparar mais de uma vez.
create unique index if not exists uniq_notifications_new_post_once
  on public.notifications (user_id, actor_id, entity_id)
  where type = 'new_post';

create or replace function public.trg_notify_followers_new_post()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_author_name text;
begin
  if new.is_hidden then return new; end if;

  v_author_name := coalesce(new.author_name, public.notification_actor_name(new.user_id));

  insert into public.notifications (
    user_id, type, actor_id, actor_name, entity_type, entity_id, link, title
  )
  select
    uf.follower_id,
    'new_post',
    new.user_id,
    v_author_name,
    'forum_post',
    new.id,
    '/forum/' || new.slug,
    new.title
  from public.user_follows uf
  where uf.following_id = new.user_id
  on conflict do nothing;

  return new;
exception when others then
  raise warning 'trg_notify_followers_new_post falhou (post %): %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_forum_posts_notify_followers on public.forum_posts;
create trigger trg_forum_posts_notify_followers
  after insert on public.forum_posts
  for each row execute function public.trg_notify_followers_new_post();
