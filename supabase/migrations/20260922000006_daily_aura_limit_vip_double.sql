-- Dobra o limite diário de reações dadas (50 -> 100) para VIP. Reescreve as
-- 3 RPCs de toggle inteiras (CREATE OR REPLACE, não é possível fazer ALTER
-- parcial em plpgsql) — corpo idêntico ao vigente em
-- 20260828_streak_aura_multiplier.sql (toggle_forum_aura,
-- toggle_forum_post_aura) e 20260830010000_peripheral_comments_and_votes.sql
-- (toggle_peripheral_comment_aura), só trocando os 5 pontos de
-- `if v_given_today >= 50` por um limite dinâmico resolvido via
-- is_vip_active() (20260922000001_is_vip_active_helper.sql) sobre o tier de
-- quem está dando a reação (p_giver_id).

create or replace function public.toggle_forum_aura(
  p_giver_id    uuid,
  p_target_type text,
  p_target_id   uuid,
  p_kind        text default 'like'
) returns table(reaction text, aura_count integer)
language plpgsql security definer
set search_path = public as $$
declare
  v_author_id         uuid;
  v_post_id           uuid;
  v_existing_kind     text;
  v_new_count         integer;
  v_given_today       integer;
  v_daily_limit       integer;
  v_received_reason   text;
  v_removed_reason    text;
  v_disliked_reason   text;
  v_undisliked_reason text;
  v_leg_delta         integer;
  v_count_delta       integer;
  v_ledger_reason     text;
  v_credited          integer;
begin
  if p_target_type not in ('comment', 'blog_comment') then
    raise exception 'invalid target_type';
  end if;
  if p_kind not in ('like', 'dislike') then
    raise exception 'invalid kind';
  end if;

  select case when public.is_vip_active(account_tier, vip_expires_at) then 100 else 50 end
    into v_daily_limit
  from public.user_profiles
  where id = p_giver_id;
  v_daily_limit := coalesce(v_daily_limit, 50);

  if p_target_type = 'comment' then
    select user_id, post_id into v_author_id, v_post_id from public.forum_comments where id = p_target_id for update;
  else
    select user_id into v_author_id from public.blog_comments where id = p_target_id for update;
  end if;

  if v_author_id is null then
    raise exception 'target not found or has no author';
  end if;
  if v_author_id = p_giver_id then
    raise exception 'self_aura_not_allowed';
  end if;

  v_received_reason   := case p_target_type
    when 'comment' then 'comment_aura_received' else 'blog_comment_aura_received' end;
  v_removed_reason    := case p_target_type
    when 'comment' then 'comment_aura_removed' else 'blog_comment_aura_removed' end;
  v_disliked_reason   := case p_target_type
    when 'comment' then 'comment_aura_disliked' else 'blog_comment_aura_disliked' end;
  v_undisliked_reason := case p_target_type
    when 'comment' then 'comment_aura_undisliked' else 'blog_comment_aura_undisliked' end;

  if p_target_type = 'comment' then
    select kind into v_existing_kind from public.forum_aura where giver_id = p_giver_id and comment_id = p_target_id;
  else
    select kind into v_existing_kind from public.forum_aura where giver_id = p_giver_id and blog_comment_id = p_target_id;
  end if;

  if v_existing_kind is null then
    select count(*) into v_given_today
    from public.aura_ledger
    where giver_id = p_giver_id
      and created_at >= now() - interval '24 hours'
      and reason in (
        'comment_aura_received', 'blog_comment_aura_received',
        'comment_aura_disliked', 'blog_comment_aura_disliked'
      );

    if v_given_today >= v_daily_limit then
      raise exception 'daily_aura_limit_reached';
    end if;

    if p_target_type = 'comment' then
      insert into public.forum_aura (giver_id, comment_id, kind) values (p_giver_id, p_target_id, p_kind);
    else
      insert into public.forum_aura (giver_id, blog_comment_id, kind) values (p_giver_id, p_target_id, p_kind);
    end if;

    v_count_delta := case when p_kind = 'like' then 1 else -1 end;
    v_ledger_reason := case when p_kind = 'like' then v_received_reason else v_disliked_reason end;

    if p_kind = 'like' then
      -- Só o "like" é ganho de verdade — passa pelo multiplicador; o
      -- "dislike" tira aura do autor, então segue o caminho antigo (sem bônus).
      v_credited := public.apply_aura_gain(v_author_id, v_count_delta);
      insert into public.aura_ledger (user_id, delta, reason, source_comment_id, source_blog_comment_id, giver_id)
      values (
        v_author_id, v_credited, v_ledger_reason,
        case when p_target_type = 'comment' then p_target_id end,
        case when p_target_type = 'blog_comment' then p_target_id end,
        p_giver_id
      );
    else
      insert into public.aura_ledger (user_id, delta, reason, source_comment_id, source_blog_comment_id, giver_id)
      values (
        v_author_id, v_count_delta, v_ledger_reason,
        case when p_target_type = 'comment' then p_target_id end,
        case when p_target_type = 'blog_comment' then p_target_id end,
        p_giver_id
      );
      insert into public.user_aura_wallet (user_id, balance) values (v_author_id, greatest(v_count_delta, 0))
        on conflict (user_id) do update
          set balance = greatest(user_aura_wallet.balance + v_count_delta, 0), updated_at = now();
    end if;

  elsif v_existing_kind = p_kind then
    -- Desfaz (undo): estorno do que foi dado, sem multiplicador.
    if p_target_type = 'comment' then
      delete from public.forum_aura where giver_id = p_giver_id and comment_id = p_target_id;
    else
      delete from public.forum_aura where giver_id = p_giver_id and blog_comment_id = p_target_id;
    end if;

    v_count_delta := case when p_kind = 'like' then -1 else 1 end;
    v_ledger_reason := case when p_kind = 'like' then v_removed_reason else v_undisliked_reason end;

    insert into public.aura_ledger (user_id, delta, reason, source_comment_id, source_blog_comment_id, giver_id)
    values (
      v_author_id, v_count_delta, v_ledger_reason,
      case when p_target_type = 'comment' then p_target_id end,
      case when p_target_type = 'blog_comment' then p_target_id end,
      p_giver_id
    );

    update public.user_aura_wallet
      set balance = greatest(balance + v_count_delta, 0), updated_at = now()
      where user_id = v_author_id;

    p_kind := null;

  else
    -- Trocando like<->dislike: sem multiplicador (é ajuste líquido, não
    -- ganho novo) — mesma régua da versão anterior.
    select count(*) into v_given_today
    from public.aura_ledger
    where giver_id = p_giver_id
      and created_at >= now() - interval '24 hours'
      and reason in (
        'comment_aura_received', 'blog_comment_aura_received',
        'comment_aura_disliked', 'blog_comment_aura_disliked'
      );

    if v_given_today >= v_daily_limit then
      raise exception 'daily_aura_limit_reached';
    end if;

    if p_target_type = 'comment' then
      update public.forum_aura set kind = p_kind where giver_id = p_giver_id and comment_id = p_target_id;
    else
      update public.forum_aura set kind = p_kind where giver_id = p_giver_id and blog_comment_id = p_target_id;
    end if;

    v_leg_delta := case when v_existing_kind = 'like' then -1 else 1 end;
    v_ledger_reason := case when v_existing_kind = 'like' then v_removed_reason else v_undisliked_reason end;
    insert into public.aura_ledger (user_id, delta, reason, source_comment_id, source_blog_comment_id, giver_id)
    values (
      v_author_id, v_leg_delta, v_ledger_reason,
      case when p_target_type = 'comment' then p_target_id end,
      case when p_target_type = 'blog_comment' then p_target_id end,
      p_giver_id
    );

    v_leg_delta := case when p_kind = 'like' then 1 else -1 end;
    v_ledger_reason := case when p_kind = 'like' then v_received_reason else v_disliked_reason end;
    insert into public.aura_ledger (user_id, delta, reason, source_comment_id, source_blog_comment_id, giver_id)
    values (
      v_author_id, v_leg_delta, v_ledger_reason,
      case when p_target_type = 'comment' then p_target_id end,
      case when p_target_type = 'blog_comment' then p_target_id end,
      p_giver_id
    );

    v_count_delta := case when p_kind = 'like' then 2 else -2 end;
    update public.user_aura_wallet
      set balance = greatest(balance + v_count_delta, 0), updated_at = now()
      where user_id = v_author_id;
  end if;

  if p_target_type = 'comment' then
    update public.forum_comments set aura_count = forum_comments.aura_count + v_count_delta where id = p_target_id
      returning forum_comments.aura_count into v_new_count;
    update public.forum_posts set aura_count = forum_posts.aura_count + v_count_delta where id = v_post_id;
  else
    update public.blog_comments set aura_count = blog_comments.aura_count + v_count_delta where id = p_target_id
      returning blog_comments.aura_count into v_new_count;
  end if;

  return query select p_kind, v_new_count;
end;
$$;

revoke execute on function public.toggle_forum_aura(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_forum_aura(uuid, text, uuid, text) to service_role;

-- ────────────────────────────────────────────

create or replace function public.toggle_forum_post_aura(
  p_giver_id uuid,
  p_post_id  uuid
) returns table(reaction text, aura_count integer)
language plpgsql security definer
set search_path = public as $$
declare
  v_author_id   uuid;
  v_exists      boolean;
  v_new_count   integer;
  v_given_today integer;
  v_daily_limit integer;
  v_credited    integer;
begin
  select case when public.is_vip_active(account_tier, vip_expires_at) then 100 else 50 end
    into v_daily_limit
  from public.user_profiles
  where id = p_giver_id;
  v_daily_limit := coalesce(v_daily_limit, 50);

  select user_id into v_author_id from public.forum_posts where id = p_post_id for update;

  if v_author_id is null then
    raise exception 'target not found or has no author';
  end if;
  if v_author_id = p_giver_id then
    raise exception 'self_aura_not_allowed';
  end if;

  select exists(
    select 1 from public.forum_aura where giver_id = p_giver_id and post_id = p_post_id
  ) into v_exists;

  if v_exists then
    delete from public.forum_aura where giver_id = p_giver_id and post_id = p_post_id;

    update public.forum_posts set aura_count = forum_posts.aura_count - 1 where id = p_post_id
      returning forum_posts.aura_count into v_new_count;

    update public.user_aura_wallet
      set balance = greatest(balance - 1, 0), updated_at = now()
      where user_id = v_author_id;

    insert into public.aura_ledger (user_id, delta, reason, source_post_id, giver_id)
    values (v_author_id, -1, 'post_aura_removed', p_post_id, p_giver_id);

    return query select null::text, v_new_count;
  else
    select count(*) into v_given_today
    from public.aura_ledger
    where giver_id = p_giver_id
      and created_at >= now() - interval '24 hours'
      and reason in (
        'post_aura_received', 'comment_aura_received', 'blog_comment_aura_received',
        'comment_aura_disliked', 'blog_comment_aura_disliked'
      );

    if v_given_today >= v_daily_limit then
      raise exception 'daily_aura_limit_reached';
    end if;

    insert into public.forum_aura (giver_id, post_id, kind) values (p_giver_id, p_post_id, 'like');

    update public.forum_posts set aura_count = forum_posts.aura_count + 1 where id = p_post_id
      returning forum_posts.aura_count into v_new_count;

    v_credited := public.apply_aura_gain(v_author_id, 1);

    insert into public.aura_ledger (user_id, delta, reason, source_post_id, giver_id)
    values (v_author_id, v_credited, 'post_aura_received', p_post_id, p_giver_id);

    return query select 'like'::text, v_new_count;
  end if;
end;
$$;

revoke execute on function public.toggle_forum_post_aura(uuid, uuid) from public, anon, authenticated;
grant execute on function public.toggle_forum_post_aura(uuid, uuid) to service_role;

-- ────────────────────────────────────────────

create or replace function public.toggle_peripheral_comment_aura(
  p_giver_id   uuid,
  p_comment_id uuid,
  p_kind       text default 'like'
) returns table(reaction text, aura_count integer)
language plpgsql security definer
set search_path = public as $$
declare
  v_author_id     uuid;
  v_existing_kind text;
  v_new_count     integer;
  v_given_today   integer;
  v_daily_limit   integer;
  v_count_delta   integer;
  v_ledger_reason text;
  v_credited      integer;
begin
  if p_kind not in ('like', 'dislike') then
    raise exception 'invalid kind';
  end if;

  select case when public.is_vip_active(account_tier, vip_expires_at) then 100 else 50 end
    into v_daily_limit
  from public.user_profiles
  where id = p_giver_id;
  v_daily_limit := coalesce(v_daily_limit, 50);

  select user_id into v_author_id from public.peripheral_comments where id = p_comment_id for update;
  if v_author_id is null then
    raise exception 'target not found or has no author';
  end if;
  if v_author_id = p_giver_id then
    raise exception 'self_aura_not_allowed';
  end if;

  select kind into v_existing_kind
  from public.peripheral_aura where giver_id = p_giver_id and comment_id = p_comment_id;

  if v_existing_kind is null then
    select count(*) into v_given_today
    from public.aura_ledger
    where giver_id = p_giver_id
      and created_at >= now() - interval '24 hours'
      and reason in ('peripheral_comment_aura_received', 'peripheral_comment_aura_disliked');
    if v_given_today >= v_daily_limit then
      raise exception 'daily_aura_limit_reached';
    end if;

    insert into public.peripheral_aura (giver_id, comment_id, kind) values (p_giver_id, p_comment_id, p_kind);

    v_count_delta := case when p_kind = 'like' then 1 else -1 end;
    v_ledger_reason := case when p_kind = 'like' then 'peripheral_comment_aura_received' else 'peripheral_comment_aura_disliked' end;

    if p_kind = 'like' then
      v_credited := public.apply_aura_gain(v_author_id, v_count_delta);
      insert into public.aura_ledger (user_id, delta, reason, source_peripheral_comment_id, giver_id)
      values (v_author_id, v_credited, v_ledger_reason, p_comment_id, p_giver_id);
    else
      insert into public.aura_ledger (user_id, delta, reason, source_peripheral_comment_id, giver_id)
      values (v_author_id, v_count_delta, v_ledger_reason, p_comment_id, p_giver_id);
      insert into public.user_aura_wallet (user_id, balance) values (v_author_id, greatest(v_count_delta, 0))
        on conflict (user_id) do update
          set balance = greatest(user_aura_wallet.balance + v_count_delta, 0), updated_at = now();
    end if;

  elsif v_existing_kind = p_kind then
    -- Desfaz (undo): estorno do que foi dado, sem multiplicador.
    delete from public.peripheral_aura where giver_id = p_giver_id and comment_id = p_comment_id;

    v_count_delta := case when p_kind = 'like' then -1 else 1 end;
    v_ledger_reason := case when p_kind = 'like' then 'peripheral_comment_aura_removed' else 'peripheral_comment_aura_undisliked' end;

    insert into public.aura_ledger (user_id, delta, reason, source_peripheral_comment_id, giver_id)
    values (v_author_id, v_count_delta, v_ledger_reason, p_comment_id, p_giver_id);

    update public.user_aura_wallet
      set balance = greatest(balance + v_count_delta, 0), updated_at = now()
      where user_id = v_author_id;

    p_kind := null;

  else
    -- Troca like<->dislike: sem multiplicador (ajuste líquido, não ganho novo).
    select count(*) into v_given_today
    from public.aura_ledger
    where giver_id = p_giver_id
      and created_at >= now() - interval '24 hours'
      and reason in ('peripheral_comment_aura_received', 'peripheral_comment_aura_disliked');
    if v_given_today >= v_daily_limit then
      raise exception 'daily_aura_limit_reached';
    end if;

    update public.peripheral_aura set kind = p_kind where giver_id = p_giver_id and comment_id = p_comment_id;

    v_count_delta := case when v_existing_kind = 'like' then -1 else 1 end;
    v_ledger_reason := case when v_existing_kind = 'like' then 'peripheral_comment_aura_removed' else 'peripheral_comment_aura_undisliked' end;
    insert into public.aura_ledger (user_id, delta, reason, source_peripheral_comment_id, giver_id)
    values (v_author_id, v_count_delta, v_ledger_reason, p_comment_id, p_giver_id);

    v_count_delta := case when p_kind = 'like' then 2 else -2 end;
    v_ledger_reason := case when p_kind = 'like' then 'peripheral_comment_aura_received' else 'peripheral_comment_aura_disliked' end;
    insert into public.aura_ledger (user_id, delta, reason, source_peripheral_comment_id, giver_id)
    values (v_author_id, v_count_delta, v_ledger_reason, p_comment_id, p_giver_id);

    update public.user_aura_wallet
      set balance = greatest(balance + v_count_delta, 0), updated_at = now()
      where user_id = v_author_id;
  end if;

  update public.peripheral_comments set aura_count = peripheral_comments.aura_count + v_count_delta where id = p_comment_id
    returning peripheral_comments.aura_count into v_new_count;

  return query select p_kind, v_new_count;
end;
$$;

revoke execute on function public.toggle_peripheral_comment_aura(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_peripheral_comment_aura(uuid, uuid, text) to service_role;
