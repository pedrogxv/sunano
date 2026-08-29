-- O multiplicador de Ofensiva/VIP (`apply_aura_gain`, definido em
-- 20260828_streak_aura_multiplier.sql e estendido em
-- 20260922000005_apply_aura_gain_vip_bonus.sql) passa a valer SÓ para ganho
-- por atividade: criar post, comentar, review de periférico e curtida
-- recebida. Recompensa de valor fixo — missão diária (+5/+3/+1), bônus por
-- fechar as 3 do dia (+10) e conquista de trilha (10/25/50/100/250) — volta
-- a creditar o número cheio, sem bônus.
--
-- Por quê: `lib/aura-faq.ts`, a Central de Aura que o usuário lê, já promete
-- "esses valores são fixos — não passam pelo multiplicador" para as missões e
-- o bônus, e anuncia as conquistas como 10/25/50/100/250 secos. O cabeçalho
-- da 20260828 afirmava o contrário, e produção acabou no meio do caminho
-- (missão sem bônus, bônus de ofensiva e conquista com) — uma conquista
-- anunciada como 25 pagava 26. Recompensa fixa que paga número quebrado só
-- confunde, e entre o texto visível e o comentário da migration quem manda é
-- o texto visível.
--
-- Efeito colateral bem-vindo: `complete_daily_mission` deixa de ler
-- `user_streaks` para creditar, então a ordem entre "creditar o bônus" e
-- "avançar a ofensiva" para de mudar o valor pago. Era exatamente aí que o
-- arquivo versionado e o banco divergiam sem ninguém notar.

-- ────────────────────────────────────────────
-- 1. complete_daily_mission — mesma assinatura e mesma regra de avanço de
--    ofensiva de 20260828_streak_aura_multiplier.sql; só os dois créditos
--    saem de `apply_aura_gain` e viram crédito direto na carteira, no mesmo
--    idioma de `confirm_youtube_subscription`
--    (20260921120000_youtube_subscription_achievement.sql).
-- ────────────────────────────────────────────
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
    insert into public.user_aura_wallet (user_id, balance) values (p_user_id, v_mission_reward)
      on conflict (user_id) do update
        set balance = user_aura_wallet.balance + v_mission_reward, updated_at = now();

    insert into public.aura_ledger (user_id, delta, reason)
      values (p_user_id, v_mission_reward, 'daily_mission_completed');
  end if;

  if v_after.created_post and v_after.wrote_comment and v_after.gave_aura and not v_after.bonus_claimed then
    update public.daily_missions set bonus_claimed = true
      where user_id = p_user_id and mission_date = v_date;

    insert into public.user_aura_wallet (user_id, balance) values (p_user_id, 10)
      on conflict (user_id) do update
        set balance = user_aura_wallet.balance + 10, updated_at = now();

    insert into public.aura_ledger (user_id, delta, reason)
      values (p_user_id, 10, 'daily_streak_bonus');

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

-- ────────────────────────────────────────────
-- 2. check_and_award_track_achievements — recompensa fixa + só paga quando a
--    linha em `user_achievements` REALMENTE entrou nesta iteração.
--
--    O `on conflict do nothing` já existia, mas o crédito logo abaixo não
--    conferia se o insert pegou. O cursor do `for` trabalha com o snapshot de
--    quando foi aberto, e o insert no ledger dispara
--    `track_aura_total_earned` (20260919000000_aura_earned_achievements.sql),
--    que chama esta mesma função de volta para a trilha 'aura_earned'. Um
--    ganho grande o bastante para cruzar dois níveis de uma vez fazia a
--    chamada aninhada conceder o segundo nível, e o loop de fora — ainda com
--    o cursor velho — chegava nele, virava no-op no insert e pagava a
--    recompensa de novo.
-- ────────────────────────────────────────────
create or replace function public.check_and_award_track_achievements(
  p_user_id uuid,
  p_track   text,
  p_count   integer
) returns void language plpgsql security definer
set search_path = public as $$
declare
  v_achievement record;
  v_awarded     integer;
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
    order by a.threshold
  loop
    insert into public.user_achievements (user_id, achievement_id)
    values (p_user_id, v_achievement.id)
    on conflict (user_id, achievement_id) do nothing;

    get diagnostics v_awarded = row_count;
    if v_awarded = 0 then
      continue;
    end if;

    if v_achievement.aura_reward > 0 then
      insert into public.user_aura_wallet (user_id, balance) values (p_user_id, v_achievement.aura_reward)
        on conflict (user_id) do update
          set balance = user_aura_wallet.balance + v_achievement.aura_reward, updated_at = now();

      insert into public.aura_ledger (user_id, delta, reason)
        values (p_user_id, v_achievement.aura_reward, 'achievement_unlocked');
    end if;
  end loop;
end;
$$;

revoke execute on function public.check_and_award_track_achievements(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.check_and_award_track_achievements(uuid, text, integer) to service_role;
