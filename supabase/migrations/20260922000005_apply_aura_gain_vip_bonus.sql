-- Soma o bônus passivo de Aura para VIP em cima do multiplicador de
-- ofensiva já existente (streak_aura_multiplier_bps,
-- 20260828_streak_aura_multiplier.sql): +40bps (0,4%) sempre que o usuário
-- for VIP e não tiver ofensiva ativa hoje, ou +25bps (0,25%) ADICIONAL ao
-- bônus de ofensiva quando ela estiver ativa. Como apply_aura_gain é o único
-- ponto de crédito positivo de aura no sistema inteiro (reações, missão
-- diária, conquistas, criação de post/comentário, reviews de periférico), a
-- mudança propaga automaticamente para todas as fontes de ganho.
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
