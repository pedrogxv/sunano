-- HOTFIX URGENTE (29/08/2026): restaura o bônus de VIP em `apply_aura_gain`
-- e os limites por tier de confiança em `toggle_forum_aura`/
-- `toggle_forum_post_aura` — que estavam ATIVOS em produção e foram
-- REVERTIDOS para uma versão mais antiga (sem VIP, sem tier de confiança)
-- ao editar `20260828_streak_aura_multiplier.sql` hoje.
--
-- O que aconteceu: `20260828_streak_aura_multiplier.sql` foi editado hoje só
-- para corrigir `complete_daily_mission`/`check_and_award_track_achievements`
-- (ver 20260930000000_aura_fixed_rewards.sql) e para anotar avisos. As
-- outras três funções desse arquivo (`apply_aura_gain`, `toggle_forum_aura`,
-- `toggle_forum_post_aura`) NÃO foram tocadas na edição — mas continuavam lá
-- com o corpo ORIGINAL de agosto, já superado por
-- `20260922000005_apply_aura_gain_vip_bonus.sql` e
-- `20260923000002_aura_trust_tiers.sql`. Como o processo usado para aplicar
-- migrations neste projeto roda o SQL de arquivos alterados/novos (não segue
-- o histórico oficial de `supabase_migrations.schema_migrations` — ver
-- [[supabase-migration-drift]]), editar o arquivo de agosto fez o Postgres
-- reexecutar TODO o arquivo, e o `create or replace function` das três
-- funções não tocadas sobrescreveu silenciosamente a versão mais nova que
-- estava valendo, revertendo:
--   - `apply_aura_gain`: o bônus passivo de VIP (+0,4%/+0,25%) sumiu.
--   - `toggle_forum_aura`/`toggle_forum_post_aura`: o teto diário e o teto
--     por par por tier de confiança (nova/normal/verificada) sumiram, e
--     junto foi a proteção que fundamentou a "Damnatio Memoriae" (v0.3.4).
--
-- Confirmado por leitura direta do banco em produção via Management API:
-- as três funções estavam rodando o corpo de agosto (sem `v_vip_bps`, sem
-- `get_aura_trust_limits`) antes desta migration.
--
-- Este arquivo reaplica o corpo EXATO das versões mais novas (cópia literal
-- de 20260922000005 e 20260923000002 — nada foi reinterpretado), e não é
-- opcional: é a única correção deste incidente.
--
-- LIÇÃO para não repetir: qualquer edição em um arquivo de migration antigo
-- que tenha função redefinida em arquivo posterior arrisca reverter essa
-- função posterior inteira, mesmo que a edição não a mencione — porque o
-- reprocessamento é por ARQUIVO, não por função. Editar um migration antigo
-- neste repo só é seguro se TODAS as funções que ele define não tiverem
-- versão mais nova em outro arquivo, ou se a edição também repassar a versão
-- mais nova de qualquer função que tenha.

create or replace function public.apply_aura_gain(
  p_user_id     uuid,
  p_base_amount integer
) returns integer
language plpgsql security definer
set search_path = public as $$
declare
  v_streak_days    integer;
  v_streak_bps     integer;
  v_vip_bps        integer;
  v_bps            integer;
  v_bonus          integer;
  v_total          integer;
  v_account_tier   text;
  v_vip_expires_at timestamptz;
begin
  if p_base_amount <= 0 then
    return p_base_amount;
  end if;

  select case
    when last_completed_date = (now() at time zone 'utc')::date
      or last_completed_date = (now() at time zone 'utc')::date - 1
    then current_streak
    else 0
  end into v_streak_days
  from public.user_streaks
  where user_id = p_user_id;

  v_streak_days := coalesce(v_streak_days, 0);
  v_streak_bps := public.streak_aura_multiplier_bps(v_streak_days);

  select account_tier, vip_expires_at into v_account_tier, v_vip_expires_at
  from public.user_profiles
  where id = p_user_id;

  v_vip_bps := case
    when not public.is_vip_active(v_account_tier, v_vip_expires_at) then 0
    when v_streak_days > 0 then 25
    else 40
  end;

  v_bps := v_streak_bps + v_vip_bps;
  -- Arredonda pra cima: um bônus de "1.1%" sobre um ganho de 1 não pode virar
  -- 0 por truncamento e desaparecer.
  v_bonus := ceil(p_base_amount * v_bps / 10000.0)::integer;
  v_total := p_base_amount + v_bonus;

  insert into public.user_aura_wallet (user_id, balance) values (p_user_id, v_total)
    on conflict (user_id) do update
      set balance = greatest(user_aura_wallet.balance + v_total, 0), updated_at = now();

  return v_total;
end;
$$;

revoke execute on function public.apply_aura_gain(uuid, integer) from public, anon, authenticated;
grant execute on function public.apply_aura_gain(uuid, integer) to service_role;

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
