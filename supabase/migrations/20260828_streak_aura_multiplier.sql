-- Multiplicador de Aura por Ofensiva (streak) — quanto mais dias seguidos
-- completando as missões diárias, maior o bônus percentual em cima de TODO
-- ganho positivo de aura (curtidas recebidas em post/comentário/blog, missão
-- diária, bônus de ofensiva, conquistas). Remoções/undo de aura continuam
-- desfazendo o valor exato que foi dado — o multiplicador só entra na hora
-- de ganhar, nunca no estorno, senão dar+desfazer deixaria de ser neutro.
--
-- Fórmula (ver `lib/streak-multiplier.ts`, mesma tabela replicada em SQL):
--   ciclo = dias_completos_de_31_já_percorridos (0, 1, 2...)
--   dia_no_ciclo = posição dentro do ciclo atual (1..31)
--   base_do_ciclo = 1.0% + 2.0% × ciclo   (1º ciclo=1.0%, 2º=3.0%, 3º=5.0%...)
--   teto_do_ciclo = min(2.0% + 2.0% × ciclo, 6.0%)
--   multiplicador = min(base_do_ciclo + dia_no_ciclo × 0.1%, teto_do_ciclo, 6.0%)
--
-- Dia 1=1.1%, dia 2=1.2%, dia 5=1.5%, dia 10..31=2.0% (trava), dia 32=3.1%
-- (novo ciclo), trava em 4.0% do dia 41 ao 62, dia 63=5.1%, trava em 6.0%
-- (teto absoluto) a partir do dia 92.
--
-- `aura_count` (o contador de "pessoas que deram aura" em posts/comentários,
-- que só soma ±1/±2) NÃO é afetado — só a carteira pessoal
-- (`user_aura_wallet.balance`) e o extrato (`aura_ledger.delta`) recebem o
-- bônus, então o placar público de curtidas continua batendo com quem
-- curtiu, e o bônus fica visível só no saldo/extrato do próprio usuário.

-- ────────────────────────────────────────────
-- 1. streak_aura_multiplier_bps — multiplicador em basis points (1% = 100bps)
--    pra evitar arredondamento de float em dinheiro. Ex.: dia 5 → 150 (1.5%).
-- ────────────────────────────────────────────
create or replace function public.streak_aura_multiplier_bps(p_streak_days integer)
returns integer
language sql immutable as $$
  select case
    when p_streak_days <= 0 then 0
    else least(
      -- base_do_ciclo + dia_no_ciclo × 10bps
      (100 + 200 * ((p_streak_days - 1) / 31)) + (((p_streak_days - 1) % 31) + 1) * 10,
      -- teto do ciclo atual
      least(200 + 200 * ((p_streak_days - 1) / 31), 600),
      -- teto absoluto
      600
    )
  end;
$$;

-- ────────────────────────────────────────────
-- 2. apply_aura_gain — credita um ganho positivo de aura já com o bônus de
--    ofensiva embutido, e devolve o valor efetivamente creditado (pra gravar
--    no ledger com o número real, não o nominal). `p_base_amount` deve ser
--    sempre > 0 — para remoções/undo continue somando direto na wallet como
--    hoje, sem passar por aqui.
-- ────────────────────────────────────────────
create or replace function public.apply_aura_gain(
  p_user_id     uuid,
  p_base_amount integer
) returns integer
language plpgsql security definer
set search_path = public as $$
declare
  v_streak_days integer;
  v_bps         integer;
  v_bonus       integer;
  v_total       integer;
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

  v_bps := public.streak_aura_multiplier_bps(coalesce(v_streak_days, 0));
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

revoke execute on function public.streak_aura_multiplier_bps(integer) from public, anon, authenticated;
grant execute on function public.streak_aura_multiplier_bps(integer) to service_role, authenticated, anon;
revoke execute on function public.apply_aura_gain(uuid, integer) from public, anon, authenticated;
grant execute on function public.apply_aura_gain(uuid, integer) to service_role;

-- ────────────────────────────────────────────
-- 3. Repassa toggle_forum_aura (comment/blog_comment), toggle_forum_post_aura
--    e complete_daily_mission para creditar ganhos via apply_aura_gain — só
--    o "insert ... on conflict" de crédito positivo muda; undo/remoção e
--    troca like<->dislike continuam ajustando a wallet direto pelo delta
--    líquido, sem multiplicador (é estorno, não ganho novo).
-- ────────────────────────────────────────────

-- 3a. toggle_forum_aura (comment | blog_comment) — mesma assinatura de
--     20260823000000_forum_post_aura_from_comments.sql.
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

    if v_given_today >= 50 then
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

    if v_given_today >= 50 then
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

-- 3b. toggle_forum_post_aura (post like/undo, sem dislike) — mesma
--     assinatura de 20260824000000_forum_post_direct_aura.sql.
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
  v_credited    integer;
begin
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

    if v_given_today >= 50 then
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

-- 3c. complete_daily_mission — o crédito por missão (+5 post, +3 comentário,
--     +1 aura — ver 20260811000000_daily_mission_reward_rebalance.sql — e o
--     +10 de bônus ao fechar as 3) passa a levar o multiplicador. O avanço do
--     streak em si (current_streak/longest_streak) não muda — o multiplicador
--     é lido ANTES de avançar `user_streaks`, então o bônus do dia de hoje
--     usa a ofensiva que o usuário TINHA ao entrar no dia (streak já contava
--     ontem), não a que ele acabou de destravar completando a 3ª missão.
create or replace function public.complete_daily_mission(
  p_user_id uuid,
  p_mission text
) returns table(all_completed boolean, streak integer)
language plpgsql security definer
set search_path = public as $$
declare
  v_date            date := (now() at time zone 'utc')::date;
  v_before          public.daily_missions%rowtype;
  v_after           public.daily_missions%rowtype;
  v_prev_date       date;
  v_prev_streak     integer;
  v_new_streak      integer;
  v_credited        integer;
  v_mission_reward  integer;
begin
  if p_mission not in ('post', 'aura', 'comment') then
    raise exception 'invalid mission';
  end if;

  v_mission_reward := case p_mission
    when 'post' then 5
    when 'comment' then 3
    when 'aura' then 1
  end;

  insert into public.daily_missions (user_id, mission_date) values (p_user_id, v_date)
    on conflict (user_id, mission_date) do nothing;

  select * into v_before from public.daily_missions
    where user_id = p_user_id and mission_date = v_date for update;

  update public.daily_missions set
    created_post  = created_post  or (p_mission = 'post'),
    wrote_comment = wrote_comment or (p_mission = 'comment'),
    gave_aura     = gave_aura     or (p_mission = 'aura'),
    updated_at = now()
  where user_id = p_user_id and mission_date = v_date
  returning * into v_after;

  if (p_mission = 'post' and not v_before.created_post and v_after.created_post)
     or (p_mission = 'comment' and not v_before.wrote_comment and v_after.wrote_comment)
     or (p_mission = 'aura' and not v_before.gave_aura and v_after.gave_aura) then
    v_credited := public.apply_aura_gain(p_user_id, v_mission_reward);
    insert into public.aura_ledger (user_id, delta, reason) values (p_user_id, v_credited, 'daily_mission_completed');
  end if;

  if v_after.created_post and v_after.wrote_comment and v_after.gave_aura and not v_after.bonus_claimed then
    update public.daily_missions set bonus_claimed = true
      where user_id = p_user_id and mission_date = v_date;

    v_credited := public.apply_aura_gain(p_user_id, 10);
    insert into public.aura_ledger (user_id, delta, reason) values (p_user_id, v_credited, 'daily_streak_bonus');

    select last_completed_date, current_streak into v_prev_date, v_prev_streak
      from public.user_streaks where user_id = p_user_id;

    v_new_streak := case
      when v_prev_date = v_date - 1 then coalesce(v_prev_streak, 0) + 1
      when v_prev_date = v_date then coalesce(v_prev_streak, 1)
      else 1
    end;

    insert into public.user_streaks (user_id, current_streak, longest_streak, last_completed_date)
    values (p_user_id, v_new_streak, v_new_streak, v_date)
    on conflict (user_id) do update set
      current_streak = v_new_streak,
      longest_streak = greatest(user_streaks.longest_streak, v_new_streak),
      last_completed_date = v_date,
      updated_at = now();
  end if;

  return query
    select
      (v_after.created_post and v_after.wrote_comment and v_after.gave_aura),
      coalesce((select current_streak from public.user_streaks where user_id = p_user_id), 0);
end;
$$;

revoke execute on function public.complete_daily_mission(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_daily_mission(uuid, text) to service_role;

-- 3d. check_and_award_track_achievements — recompensa de conquista também
--     passa pelo multiplicador.
create or replace function public.check_and_award_track_achievements(
  p_user_id uuid,
  p_track   text,
  p_count   integer
) returns void language plpgsql security definer
set search_path = public as $$
declare
  v_achievement record;
  v_credited    integer;
begin
  for v_achievement in
    select a.id, a.aura_reward
    from public.achievements a
    where a.track = p_track
      and a.threshold <= p_count
      and not exists (
        select 1 from public.user_achievements ua
        where ua.user_id = p_user_id and ua.achievement_id = a.id
      )
  loop
    insert into public.user_achievements (user_id, achievement_id)
    values (p_user_id, v_achievement.id)
    on conflict (user_id, achievement_id) do nothing;

    if v_achievement.aura_reward > 0 then
      v_credited := public.apply_aura_gain(p_user_id, v_achievement.aura_reward);
      insert into public.aura_ledger (user_id, delta, reason) values (p_user_id, v_credited, 'achievement_unlocked');
    end if;
  end loop;
end;
$$;

revoke execute on function public.check_and_award_track_achievements(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.check_and_award_track_achievements(uuid, text, integer) to service_role;

-- 3e. credit_forum_post_creation_aura (+10 por criar post, 1x/24h) — mesma
--     assinatura de 20260804120000_aura_rebalance.sql.
create or replace function public.credit_forum_post_creation_aura(
  p_user_id uuid,
  p_post_id uuid
) returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_already_rewarded boolean;
  v_credited         integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('aura:post_created:' || p_user_id::text, 0));

  select exists(
    select 1 from public.aura_ledger
    where user_id = p_user_id
      and reason = 'post_created'
      and created_at >= now() - interval '24 hours'
  ) into v_already_rewarded;

  if v_already_rewarded then
    return false;
  end if;

  v_credited := public.apply_aura_gain(p_user_id, 10);
  insert into public.aura_ledger (user_id, delta, reason, source_post_id)
  values (p_user_id, v_credited, 'post_created', p_post_id);

  return true;
end;
$$;

revoke execute on function public.credit_forum_post_creation_aura(uuid, uuid) from public, anon, authenticated;
grant execute on function public.credit_forum_post_creation_aura(uuid, uuid) to service_role;

-- 3f. credit_comment_creation_aura (+5 por comentar, 1x por post/notícia) —
--     mesma assinatura de 20260804120000_aura_rebalance.sql. A idempotência
--     continua no índice único parcial do ledger; só credita via
--     apply_aura_gain quando a linha do ledger realmente entrou.
create or replace function public.credit_comment_creation_aura(
  p_user_id     uuid,
  p_target_type text,
  p_target_id   uuid
) returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_inserted integer;
  v_credited integer;
begin
  if p_target_type not in ('post', 'blog_post') then
    raise exception 'invalid target_type';
  end if;

  v_credited := public.apply_aura_gain(p_user_id, 5);

  if p_target_type = 'post' then
    insert into public.aura_ledger (user_id, delta, reason, source_post_id)
    values (p_user_id, v_credited, 'comment_created', p_target_id)
    on conflict (user_id, source_post_id) where reason = 'comment_created' do nothing;
  else
    insert into public.aura_ledger (user_id, delta, reason, source_blog_post_id)
    values (p_user_id, v_credited, 'blog_comment_created', p_target_id)
    on conflict (user_id, source_blog_post_id) where reason = 'blog_comment_created' do nothing;
  end if;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    -- Já premiado antes: desfaz o crédito que apply_aura_gain já aplicou na
    -- wallet, já que o ledger (fonte da verdade de idempotência) não gravou.
    update public.user_aura_wallet
      set balance = greatest(balance - v_credited, 0), updated_at = now()
      where user_id = p_user_id;
    return false;
  end if;

  return true;
end;
$$;

revoke execute on function public.credit_comment_creation_aura(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.credit_comment_creation_aura(uuid, text, uuid) to service_role;
