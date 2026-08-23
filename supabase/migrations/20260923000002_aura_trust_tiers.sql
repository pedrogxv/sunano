-- Anti-farm: nível de confiança do doador de Aura, com 3 tiers —
-- 'new' (conta < 3 dias), 'normal' (>= 3 dias) e 'verified' (YouTube
-- confirmado OU VIP ativo OU conta >= 14 dias). Ataca o padrão de abuso
-- observado (contas descartáveis usadas pra farm de aura, e uma única conta
-- esvaziando o teto diário inteiro em um único alvo) com duas mudanças:
--
-- 1. Conta 'new' que doa aura tem o crédito ao alvo SEM o bônus de
--    streak/VIP do receptor (pula `apply_aura_gain`, credita v_count_delta
--    puro) — mesma régua que já existe hoje pros ramos de "dislike" e
--    "undo", que também não passam por apply_aura_gain.
-- 2. Novo teto diário POR PAR doador→destinatário (1/3/5 conforme o tier do
--    doador), além do teto diário total já existente
--    (20260922000006_daily_aura_limit_vip_double.sql). Só curtidas/dislikes
--    NOVOS consomem o teto por par — undo não, troca like<->dislike sim
--    (mesma régua do teto diário total: troca é uma concessão líquida nova).
--
-- Importante: VIP comprado nos primeiros 3 dias de conta NÃO pula o tier
-- 'new' — o cenário que isso fecha é "criei conta e comprei VIP em segundos
-- pra explorar o sistema". VIP segue aumentando o teto diário TOTAL (50->100,
-- já existente), só não isenta do peso reduzido de conta nova.

-- ────────────────────────────────────────────
-- 1. get_giver_trust_tier — helper de leitura (nos moldes de
--    is_vip_active(), 20260922000001_is_vip_active_helper.sql). Liberado
--    também pra authenticated/anon porque é só leitura de dado público de
--    tier (mesmo padrão de streak_aura_multiplier_bps).
-- ────────────────────────────────────────────
create or replace function public.get_giver_trust_tier(p_giver_id uuid)
returns text
language plpgsql stable security definer
set search_path = public as $$
declare
  v_created_at     timestamptz;
  v_account_tier   text;
  v_vip_expires_at timestamptz;
  v_account_age    interval;
  v_youtube_ok     boolean;
begin
  select created_at, account_tier, vip_expires_at
    into v_created_at, v_account_tier, v_vip_expires_at
  from public.user_profiles
  where id = p_giver_id;

  if v_created_at is null then
    return 'new';
  end if;

  v_account_age := now() - v_created_at;

  if v_account_age < interval '3 days' then
    return 'new';
  end if;

  select exists(
    select 1 from public.user_youtube_subscription where user_id = p_giver_id
  ) into v_youtube_ok;

  if v_youtube_ok
    or public.is_vip_active(v_account_tier, v_vip_expires_at)
    or v_account_age >= interval '14 days'
  then
    return 'verified';
  end if;

  return 'normal';
end;
$$;

revoke execute on function public.get_giver_trust_tier(uuid) from public;
grant execute on function public.get_giver_trust_tier(uuid) to service_role, authenticated, anon;

-- ────────────────────────────────────────────
-- 2. get_aura_trust_limits — teto diário total + teto por par, resolvidos a
--    partir do trust tier e do VIP (VIP dobra o teto diário total, já
--    existente, mas não muda o teto por par nem o peso ao doar).
-- ────────────────────────────────────────────
create or replace function public.get_aura_trust_limits(p_giver_id uuid)
returns table(trust_tier text, daily_limit integer, pair_limit integer, skip_gain_bonus boolean)
language plpgsql stable security definer
set search_path = public as $$
declare
  v_tier           text;
  v_account_tier   text;
  v_vip_expires_at timestamptz;
  v_is_vip         boolean;
begin
  v_tier := public.get_giver_trust_tier(p_giver_id);

  select account_tier, vip_expires_at into v_account_tier, v_vip_expires_at
  from public.user_profiles
  where id = p_giver_id;

  v_is_vip := public.is_vip_active(v_account_tier, v_vip_expires_at);

  return query select
    v_tier,
    case
      when v_tier = 'new' then 15
      else (case when v_is_vip then 100 else 50 end)
    end,
    case
      when v_tier = 'new' then 1
      when v_tier = 'normal' then 3
      else 5
    end,
    (v_tier = 'new');
end;
$$;

revoke execute on function public.get_aura_trust_limits(uuid) from public;
grant execute on function public.get_aura_trust_limits(uuid) to service_role, authenticated, anon;

-- ────────────────────────────────────────────
-- 3. Reescrita das 3 RPCs de toggle — corpo idêntico ao vigente em
--    20260922000006_daily_aura_limit_vip_double.sql, trocando a resolução
--    de v_daily_limit (antes só is_vip_active) por get_aura_trust_limits, e
--    adicionando a checagem de teto por par + o skip do bônus de
--    apply_aura_gain pra doador 'new'.
-- ────────────────────────────────────────────
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
  v_given_to_pair     integer;
  v_daily_limit       integer;
  v_pair_limit        integer;
  v_skip_gain_bonus   boolean;
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

  select daily_limit, pair_limit, skip_gain_bonus
    into v_daily_limit, v_pair_limit, v_skip_gain_bonus
  from public.get_aura_trust_limits(p_giver_id);
  v_daily_limit := coalesce(v_daily_limit, 50);
  v_pair_limit := coalesce(v_pair_limit, 3);
  v_skip_gain_bonus := coalesce(v_skip_gain_bonus, false);

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

    select count(*) into v_given_to_pair
    from public.aura_ledger
    where giver_id = p_giver_id
      and user_id = v_author_id
      and created_at >= now() - interval '24 hours'
      and reason in (
        'comment_aura_received', 'blog_comment_aura_received',
        'comment_aura_disliked', 'blog_comment_aura_disliked'
      );

    if v_given_to_pair >= v_pair_limit then
      raise exception 'daily_pair_aura_limit_reached';
    end if;

    if p_target_type = 'comment' then
      insert into public.forum_aura (giver_id, comment_id, kind) values (p_giver_id, p_target_id, p_kind);
    else
      insert into public.forum_aura (giver_id, blog_comment_id, kind) values (p_giver_id, p_target_id, p_kind);
    end if;

    v_count_delta := case when p_kind = 'like' then 1 else -1 end;
    v_ledger_reason := case when p_kind = 'like' then v_received_reason else v_disliked_reason end;

    if p_kind = 'like' then
      -- Só o "like" é ganho de verdade — passa pelo multiplicador, exceto
      -- quando o doador é conta nova (v_skip_gain_bonus): aí credita o
      -- delta puro, sem bônus de streak/VIP do receptor, mesma régua já
      -- usada pro "dislike" (que também nunca passou pelo multiplicador).
      if v_skip_gain_bonus then
        v_credited := v_count_delta;
        insert into public.user_aura_wallet (user_id, balance) values (v_author_id, greatest(v_credited, 0))
          on conflict (user_id) do update
            set balance = greatest(user_aura_wallet.balance + v_credited, 0), updated_at = now();
      else
        v_credited := public.apply_aura_gain(v_author_id, v_count_delta);
      end if;
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
    -- Desfaz (undo): estorno do que foi dado, sem multiplicador, não
    -- consome o teto por par.
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
    -- ganho novo), mas conta como concessão nova pros dois tetos.
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

    select count(*) into v_given_to_pair
    from public.aura_ledger
    where giver_id = p_giver_id
      and user_id = v_author_id
      and created_at >= now() - interval '24 hours'
      and reason in (
        'comment_aura_received', 'blog_comment_aura_received',
        'comment_aura_disliked', 'blog_comment_aura_disliked'
      );

    if v_given_to_pair >= v_pair_limit then
      raise exception 'daily_pair_aura_limit_reached';
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
  v_author_id       uuid;
  v_exists          boolean;
  v_new_count       integer;
  v_given_today     integer;
  v_given_to_pair   integer;
  v_daily_limit     integer;
  v_pair_limit      integer;
  v_skip_gain_bonus boolean;
  v_credited        integer;
begin
  select daily_limit, pair_limit, skip_gain_bonus
    into v_daily_limit, v_pair_limit, v_skip_gain_bonus
  from public.get_aura_trust_limits(p_giver_id);
  v_daily_limit := coalesce(v_daily_limit, 50);
  v_pair_limit := coalesce(v_pair_limit, 3);
  v_skip_gain_bonus := coalesce(v_skip_gain_bonus, false);

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

    select count(*) into v_given_to_pair
    from public.aura_ledger
    where giver_id = p_giver_id
      and user_id = v_author_id
      and created_at >= now() - interval '24 hours'
      and reason in (
        'post_aura_received', 'comment_aura_received', 'blog_comment_aura_received',
        'comment_aura_disliked', 'blog_comment_aura_disliked'
      );

    if v_given_to_pair >= v_pair_limit then
      raise exception 'daily_pair_aura_limit_reached';
    end if;

    insert into public.forum_aura (giver_id, post_id, kind) values (p_giver_id, p_post_id, 'like');

    update public.forum_posts set aura_count = forum_posts.aura_count + 1 where id = p_post_id
      returning forum_posts.aura_count into v_new_count;

    if v_skip_gain_bonus then
      v_credited := 1;
      insert into public.user_aura_wallet (user_id, balance) values (v_author_id, greatest(v_credited, 0))
        on conflict (user_id) do update
          set balance = greatest(user_aura_wallet.balance + v_credited, 0), updated_at = now();
    else
      v_credited := public.apply_aura_gain(v_author_id, 1);
    end if;

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
  v_author_id       uuid;
  v_existing_kind   text;
  v_new_count       integer;
  v_given_today     integer;
  v_given_to_pair   integer;
  v_daily_limit     integer;
  v_pair_limit      integer;
  v_skip_gain_bonus boolean;
  v_count_delta     integer;
  v_ledger_reason   text;
  v_credited        integer;
begin
  if p_kind not in ('like', 'dislike') then
    raise exception 'invalid kind';
  end if;

  select daily_limit, pair_limit, skip_gain_bonus
    into v_daily_limit, v_pair_limit, v_skip_gain_bonus
  from public.get_aura_trust_limits(p_giver_id);
  v_daily_limit := coalesce(v_daily_limit, 50);
  v_pair_limit := coalesce(v_pair_limit, 3);
  v_skip_gain_bonus := coalesce(v_skip_gain_bonus, false);

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

    select count(*) into v_given_to_pair
    from public.aura_ledger
    where giver_id = p_giver_id
      and user_id = v_author_id
      and created_at >= now() - interval '24 hours'
      and reason in ('peripheral_comment_aura_received', 'peripheral_comment_aura_disliked');
    if v_given_to_pair >= v_pair_limit then
      raise exception 'daily_pair_aura_limit_reached';
    end if;

    insert into public.peripheral_aura (giver_id, comment_id, kind) values (p_giver_id, p_comment_id, p_kind);

    v_count_delta := case when p_kind = 'like' then 1 else -1 end;
    v_ledger_reason := case when p_kind = 'like' then 'peripheral_comment_aura_received' else 'peripheral_comment_aura_disliked' end;

    if p_kind = 'like' then
      if v_skip_gain_bonus then
        v_credited := v_count_delta;
        insert into public.user_aura_wallet (user_id, balance) values (v_author_id, greatest(v_credited, 0))
          on conflict (user_id) do update
            set balance = greatest(user_aura_wallet.balance + v_credited, 0), updated_at = now();
      else
        v_credited := public.apply_aura_gain(v_author_id, v_count_delta);
      end if;
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
    -- Desfaz (undo): estorno do que foi dado, sem multiplicador, não
    -- consome o teto por par.
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
    -- Troca like<->dislike: sem multiplicador (ajuste líquido, não ganho
    -- novo), mas conta como concessão nova pros dois tetos.
    select count(*) into v_given_today
    from public.aura_ledger
    where giver_id = p_giver_id
      and created_at >= now() - interval '24 hours'
      and reason in ('peripheral_comment_aura_received', 'peripheral_comment_aura_disliked');
    if v_given_today >= v_daily_limit then
      raise exception 'daily_aura_limit_reached';
    end if;

    select count(*) into v_given_to_pair
    from public.aura_ledger
    where giver_id = p_giver_id
      and user_id = v_author_id
      and created_at >= now() - interval '24 hours'
      and reason in ('peripheral_comment_aura_received', 'peripheral_comment_aura_disliked');
    if v_given_to_pair >= v_pair_limit then
      raise exception 'daily_pair_aura_limit_reached';
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
