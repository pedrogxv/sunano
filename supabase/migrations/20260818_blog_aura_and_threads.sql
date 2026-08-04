-- Traz `blog_comments`/`blog_posts` (notícias) para a mesma lógica de
-- comentários do fórum: threads de 1 nível e sistema de Aura. Mantém
-- `forum_aura`/`toggle_forum_aura` como a única tabela/função de aura do
-- app (em vez de duplicar wallet/ledger), só ampliando os alvos aceitos.

-- ── Threading (espelha 20260813_forum_comment_threads.sql) ──────────────────

alter table public.blog_comments
  add column if not exists parent_comment_id uuid references public.blog_comments(id) on delete cascade;

create index if not exists idx_blog_comments_parent
  on public.blog_comments (parent_comment_id);

create or replace function public.blog_comments_check_depth()
returns trigger language plpgsql as $$
declare
  v_grandparent uuid;
begin
  if new.parent_comment_id is not null then
    if new.parent_comment_id = new.id then
      raise exception 'blog_comments: um comentário não pode responder a si mesmo';
    end if;
    select parent_comment_id into v_grandparent
    from public.blog_comments where id = new.parent_comment_id;
    if v_grandparent is not null then
      raise exception 'blog_comments: máximo de 1 nível de resposta (responda ao comentário raiz)';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_blog_comments_check_depth on public.blog_comments;
create trigger trg_blog_comments_check_depth
  before insert or update on public.blog_comments
  for each row execute function public.blog_comments_check_depth();

-- ── Aura (espelha 20260806_forum_aura.sql / 20260810_forum_aura_10x_and_daily_limit.sql) ──

alter table public.blog_posts
  add column if not exists aura_count integer not null default 0;

alter table public.blog_comments
  add column if not exists aura_count integer not null default 0;

alter table public.forum_aura
  add column if not exists blog_post_id uuid references public.blog_posts(id) on delete cascade,
  add column if not exists blog_comment_id uuid references public.blog_comments(id) on delete cascade;

alter table public.forum_aura
  drop constraint if exists forum_aura_single_target;

alter table public.forum_aura
  add constraint forum_aura_single_target check (
    (
      (post_id is not null)::int +
      (comment_id is not null)::int +
      (blog_post_id is not null)::int +
      (blog_comment_id is not null)::int
    ) = 1
  );

create unique index if not exists forum_aura_giver_blog_post_key
  on public.forum_aura (giver_id, blog_post_id) where blog_post_id is not null;
create unique index if not exists forum_aura_giver_blog_comment_key
  on public.forum_aura (giver_id, blog_comment_id) where blog_comment_id is not null;

create index if not exists idx_forum_aura_blog_post
  on public.forum_aura (blog_post_id) where blog_post_id is not null;
create index if not exists idx_forum_aura_blog_comment
  on public.forum_aura (blog_comment_id) where blog_comment_id is not null;

alter table public.aura_ledger
  drop constraint if exists aura_ledger_reason_check,
  add constraint aura_ledger_reason_check check (reason in (
    'post_aura_received', 'post_aura_removed',
    'comment_aura_received', 'comment_aura_removed',
    'event_medal_redeemed',
    'blog_post_aura_received', 'blog_post_aura_removed',
    'blog_comment_aura_received', 'blog_comment_aura_removed'
  ));

alter table public.aura_ledger
  add column if not exists source_blog_post_id uuid references public.blog_posts(id) on delete set null,
  add column if not exists source_blog_comment_id uuid references public.blog_comments(id) on delete set null;

create or replace function public.toggle_forum_aura(
  p_giver_id    uuid,
  p_target_type text, -- 'post' | 'comment' | 'blog_post' | 'blog_comment'
  p_target_id   uuid
) returns table(given boolean, aura_count integer)
language plpgsql security definer
set search_path = public as $$
declare
  v_author_id        uuid;
  v_exists           boolean;
  v_new_count        integer;
  v_given_today      integer;
begin
  if p_target_type not in ('post', 'comment', 'blog_post', 'blog_comment') then
    raise exception 'invalid target_type';
  end if;

  if p_target_type = 'post' then
    select user_id into v_author_id from public.forum_posts where id = p_target_id for update;
  elsif p_target_type = 'comment' then
    select user_id into v_author_id from public.forum_comments where id = p_target_id for update;
  elsif p_target_type = 'blog_post' then
    select author_id into v_author_id from public.blog_posts where id = p_target_id for update;
  else
    select user_id into v_author_id from public.blog_comments where id = p_target_id for update;
  end if;

  if v_author_id is null then
    raise exception 'target not found or has no author';
  end if;
  if v_author_id = p_giver_id then
    raise exception 'self_aura_not_allowed';
  end if;

  if p_target_type = 'post' then
    select exists(select 1 from public.forum_aura where giver_id = p_giver_id and post_id = p_target_id) into v_exists;
  elsif p_target_type = 'comment' then
    select exists(select 1 from public.forum_aura where giver_id = p_giver_id and comment_id = p_target_id) into v_exists;
  elsif p_target_type = 'blog_post' then
    select exists(select 1 from public.forum_aura where giver_id = p_giver_id and blog_post_id = p_target_id) into v_exists;
  else
    select exists(select 1 from public.forum_aura where giver_id = p_giver_id and blog_comment_id = p_target_id) into v_exists;
  end if;

  if v_exists then
    if p_target_type = 'post' then
      delete from public.forum_aura where giver_id = p_giver_id and post_id = p_target_id;
      update public.forum_posts set aura_count = greatest(forum_posts.aura_count - 10, 0) where id = p_target_id
        returning forum_posts.aura_count into v_new_count;
    elsif p_target_type = 'comment' then
      delete from public.forum_aura where giver_id = p_giver_id and comment_id = p_target_id;
      update public.forum_comments set aura_count = greatest(forum_comments.aura_count - 10, 0) where id = p_target_id
        returning forum_comments.aura_count into v_new_count;
    elsif p_target_type = 'blog_post' then
      delete from public.forum_aura where giver_id = p_giver_id and blog_post_id = p_target_id;
      update public.blog_posts set aura_count = greatest(blog_posts.aura_count - 10, 0) where id = p_target_id
        returning blog_posts.aura_count into v_new_count;
    else
      delete from public.forum_aura where giver_id = p_giver_id and blog_comment_id = p_target_id;
      update public.blog_comments set aura_count = greatest(blog_comments.aura_count - 10, 0) where id = p_target_id
        returning blog_comments.aura_count into v_new_count;
    end if;

    update public.user_aura_wallet
      set balance = greatest(balance - 10, 0), updated_at = now()
      where user_id = v_author_id;

    insert into public.aura_ledger (user_id, delta, reason, source_post_id, source_comment_id, source_blog_post_id, source_blog_comment_id, giver_id)
    values (
      v_author_id, -10,
      case p_target_type
        when 'post' then 'post_aura_removed'
        when 'comment' then 'comment_aura_removed'
        when 'blog_post' then 'blog_post_aura_removed'
        else 'blog_comment_aura_removed'
      end,
      case when p_target_type = 'post' then p_target_id end,
      case when p_target_type = 'comment' then p_target_id end,
      case when p_target_type = 'blog_post' then p_target_id end,
      case when p_target_type = 'blog_comment' then p_target_id end,
      p_giver_id
    );

    return query select false, v_new_count;
  else
    select count(*) into v_given_today
    from public.aura_ledger
    where giver_id = p_giver_id
      and delta > 0
      and created_at >= now() - interval '24 hours';

    if v_given_today >= 50 then
      raise exception 'daily_aura_limit_reached';
    end if;

    if p_target_type = 'post' then
      insert into public.forum_aura (giver_id, post_id) values (p_giver_id, p_target_id);
      update public.forum_posts set aura_count = forum_posts.aura_count + 10 where id = p_target_id
        returning forum_posts.aura_count into v_new_count;
    elsif p_target_type = 'comment' then
      insert into public.forum_aura (giver_id, comment_id) values (p_giver_id, p_target_id);
      update public.forum_comments set aura_count = forum_comments.aura_count + 10 where id = p_target_id
        returning forum_comments.aura_count into v_new_count;
    elsif p_target_type = 'blog_post' then
      insert into public.forum_aura (giver_id, blog_post_id) values (p_giver_id, p_target_id);
      update public.blog_posts set aura_count = blog_posts.aura_count + 10 where id = p_target_id
        returning blog_posts.aura_count into v_new_count;
    else
      insert into public.forum_aura (giver_id, blog_comment_id) values (p_giver_id, p_target_id);
      update public.blog_comments set aura_count = blog_comments.aura_count + 10 where id = p_target_id
        returning blog_comments.aura_count into v_new_count;
    end if;

    insert into public.user_aura_wallet (user_id, balance) values (v_author_id, 10)
      on conflict (user_id) do update set balance = user_aura_wallet.balance + 10, updated_at = now();

    insert into public.aura_ledger (user_id, delta, reason, source_post_id, source_comment_id, source_blog_post_id, source_blog_comment_id, giver_id)
    values (
      v_author_id, 10,
      case p_target_type
        when 'post' then 'post_aura_received'
        when 'comment' then 'comment_aura_received'
        when 'blog_post' then 'blog_post_aura_received'
        else 'blog_comment_aura_received'
      end,
      case when p_target_type = 'post' then p_target_id end,
      case when p_target_type = 'comment' then p_target_id end,
      case when p_target_type = 'blog_post' then p_target_id end,
      case when p_target_type = 'blog_comment' then p_target_id end,
      p_giver_id
    );

    return query select true, v_new_count;
  end if;
end;
$$;

revoke execute on function public.toggle_forum_aura(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.toggle_forum_aura(uuid, text, uuid) to service_role;
