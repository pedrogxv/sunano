-- Anexo de imagens (até 2) e @menção de usuário em comentários (fórum e
-- blog), de forma simétrica nas duas tabelas — mesmo padrão de
-- `media_image_urls` já usado em `forum_posts`.
--
-- Menção vira array (`mentioned_user_ids`) em vez de tabela própria: no
-- máximo 2 por comentário, sem necessidade de consultar "quem mencionou X"
-- fora da notificação já gerada — uma tabela extra (com índices, RLS, etc)
-- só aumentaria custo de storage/linhas no plano gratuito sem ganho real.
--
-- Aplicar via Supabase Dashboard (SQL Editor) — `supabase db push` está
-- quebrado neste projeto (histórico de migration dessincronizado desde
-- 04/08, ver notas internas).

alter table public.forum_comments
  add column if not exists image_urls text[] not null default '{}',
  add column if not exists mentioned_user_ids uuid[] not null default '{}';

alter table public.blog_comments
  add column if not exists image_urls text[] not null default '{}',
  add column if not exists mentioned_user_ids uuid[] not null default '{}';

-- Trava no banco (defesa em profundidade — a validação principal é no
-- servidor, via zod, antes do insert): nunca mais que 2 imagens/menções.
-- Postgres não tem `ADD CONSTRAINT IF NOT EXISTS` (só `ADD COLUMN`), então o
-- padrão idempotente aqui é drop + add.
alter table public.forum_comments drop constraint if exists forum_comments_image_urls_limit;
alter table public.forum_comments
  add constraint forum_comments_image_urls_limit check (array_length(image_urls, 1) is null or array_length(image_urls, 1) <= 2);

alter table public.forum_comments drop constraint if exists forum_comments_mentions_limit;
alter table public.forum_comments
  add constraint forum_comments_mentions_limit check (array_length(mentioned_user_ids, 1) is null or array_length(mentioned_user_ids, 1) <= 2);

alter table public.blog_comments drop constraint if exists blog_comments_image_urls_limit;
alter table public.blog_comments
  add constraint blog_comments_image_urls_limit check (array_length(image_urls, 1) is null or array_length(image_urls, 1) <= 2);

alter table public.blog_comments drop constraint if exists blog_comments_mentions_limit;
alter table public.blog_comments
  add constraint blog_comments_mentions_limit check (array_length(mentioned_user_ids, 1) is null or array_length(mentioned_user_ids, 1) <= 2);

-- ────────────────────────────────────────────
-- Storage — bucket dedicado `comments`
-- ────────────────────────────────────────────
-- Criado aqui via insert (diferente de `peripherals`/`images`, que foram
-- criados manualmente no dashboard) para já nascer com limite de tamanho e
-- MIME types travados a nível de bucket — segunda barreira além da validação
-- em app/api/comments/upload-image/route.ts, e reduz o risco de upload
-- indevido consumir storage/egress do plano.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comments', 'comments', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS do bucket `comments`: qualquer usuário autenticado sobe/atualiza/apaga
-- só arquivos com o próprio uid no nome (`comment-<uid>-*`), mesmo padrão de
-- `forum-post-<uid>-*` em 20260809_forum_media_storage_rls.sql. Leitura é
-- pública (bucket público, sem policy de select necessária).
drop policy if exists "Comment images upload access" on storage.objects;
create policy "Comment images upload access"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'comments'
  and name like 'comment-' || auth.uid()::text || '-%'
);

drop policy if exists "Comment images delete access" on storage.objects;
create policy "Comment images delete access"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'comments'
  and name like 'comment-' || auth.uid()::text || '-%'
);

-- ────────────────────────────────────────────
-- Notificação de menção
-- ────────────────────────────────────────────
alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in (
    'aura_received', 'post_comment', 'comment_reply', 'new_follower', 'system', 'mention'
  ));

-- Dispara para cada usuário em `mentioned_user_ids`, além do aviso normal de
-- comentário/resposta já coberto por trg_notify_forum_comment. Um `insert`
-- por menção (até 2) — mesmo trade-off do índice único de aura: aqui não há
-- dedup porque o próprio insert do comentário só acontece uma vez.
create or replace function public.trg_notify_forum_comment_mentions()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_slug   text;
  v_mentioned uuid;
begin
  if new.mentioned_user_ids is null or array_length(new.mentioned_user_ids, 1) is null then
    return new;
  end if;
  if new.is_hidden then return new; end if;

  select slug into v_slug from public.forum_posts where id = new.post_id;

  foreach v_mentioned in array new.mentioned_user_ids loop
    perform public.push_notification(
      p_user_id     => v_mentioned,
      p_type        => 'mention',
      p_actor_id    => new.user_id,
      p_actor_name  => coalesce(new.author_name, public.notification_actor_name(new.user_id)),
      p_entity_type => 'forum_comment',
      p_entity_id   => new.id,
      p_link        => case when v_slug is not null then '/forum/' || v_slug end,
      p_body        => coalesce(new.body_preview, left(new.body, 140))
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_forum_comments_notify_mentions on public.forum_comments;
create trigger trg_forum_comments_notify_mentions
  after insert on public.forum_comments
  for each row execute function public.trg_notify_forum_comment_mentions();

create or replace function public.trg_notify_blog_comment_mentions()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_slug   text;
  v_mentioned uuid;
begin
  if new.mentioned_user_ids is null or array_length(new.mentioned_user_ids, 1) is null then
    return new;
  end if;
  if new.is_hidden then return new; end if;

  select slug into v_slug from public.blog_posts where id = new.post_id;

  foreach v_mentioned in array new.mentioned_user_ids loop
    perform public.push_notification(
      p_user_id     => v_mentioned,
      p_type        => 'mention',
      p_actor_id    => new.user_id,
      p_actor_name  => coalesce(new.author_name, public.notification_actor_name(new.user_id)),
      p_entity_type => 'blog_comment',
      p_entity_id   => new.id,
      p_link        => case when v_slug is not null then '/blog/' || v_slug end,
      p_body        => coalesce(new.body_preview, left(new.body, 140))
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_blog_comments_notify_mentions on public.blog_comments;
create trigger trg_blog_comments_notify_mentions
  after insert on public.blog_comments
  for each row execute function public.trg_notify_blog_comment_mentions();
