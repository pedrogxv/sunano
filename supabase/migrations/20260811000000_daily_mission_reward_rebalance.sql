-- Rebalanceia a recompensa das missões diárias: "Criar um post" continua
-- valendo +5, "Fazer um comentário" cai pra +3 e "Dar aura em algo" cai pra
-- +1 (curtir era desproporcional ao esforço frente às outras duas). O bônus
-- de +10 ao fechar as 3 missões do dia e o avanço da ofensiva não mudam.
--
-- Repassa `complete_daily_mission` a partir da versão hoje em produção
-- (20260808_achievements_streak.sql — o crédito por missão era um +5 fixo
-- pra qualquer uma das 3); só a linha do crédito muda, pra um valor por
-- missão via `v_mission_reward`. Ver [[supabase-migration-drift]]: o arquivo
-- `20260828_streak_aura_multiplier.sql` já embutido no repo redefine essa
-- mesma função (aplicando o multiplicador de ofensiva via `apply_aura_gain`)
-- mas ainda não foi aplicado no banco remoto — foi atualizado em paralelo
-- pra já nascer com os novos valores por missão quando for aplicado, sem
-- reverter este rebalanceamento.
create or replace function public.complete_daily_mission(
  p_user_id uuid,
  p_mission text -- 'post' | 'aura' | 'comment'
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

  -- Crédito só na transição false -> true da missão específica (evita creditar de novo em toggles repetidos no mesmo dia).
  if (p_mission = 'post' and not v_before.created_post and v_after.created_post)
     or (p_mission = 'comment' and not v_before.wrote_comment and v_after.wrote_comment)
     or (p_mission = 'aura' and not v_before.gave_aura and v_after.gave_aura) then
    insert into public.user_aura_wallet (user_id, balance) values (p_user_id, v_mission_reward)
      on conflict (user_id) do update set balance = user_aura_wallet.balance + v_mission_reward, updated_at = now();
    insert into public.aura_ledger (user_id, delta, reason) values (p_user_id, v_mission_reward, 'daily_mission_completed');
  end if;

  if v_after.created_post and v_after.wrote_comment and v_after.gave_aura and not v_after.bonus_claimed then
    update public.daily_missions set bonus_claimed = true
      where user_id = p_user_id and mission_date = v_date;

    insert into public.user_aura_wallet (user_id, balance) values (p_user_id, 10)
      on conflict (user_id) do update set balance = user_aura_wallet.balance + 10, updated_at = now();
    insert into public.aura_ledger (user_id, delta, reason) values (p_user_id, 10, 'daily_streak_bonus');

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
