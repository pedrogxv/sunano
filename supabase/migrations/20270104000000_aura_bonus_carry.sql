-- Bônus de Ofensiva/VIP com fração acumulada.
--
-- Antes: `v_bonus := ceil(base * bps / 10000)`, POR GANHO. Como o maior ganho
-- de atividade é 10 e o teto do bônus é 6% (0,6), qualquer bônus > 0 virava
-- exatamente +1 por ganho: a curva de 1,1%→6% e o extra do VIP não mudavam
-- nada no saldo — 1 dia de Ofensiva rendia o mesmo que 120 dias com VIP.
--
-- Agora a parte fracionária fica guardada na carteira
-- (`bonus_carry`, em 1/10000 de Aura) e vira +1 quando a soma passa de um
-- inteiro. 6% rende de fato +6 a cada 100 de base, e o VIP soma por cima.
--
-- Carry inicial 0 para todos: quem tinha bônus ativo para de ganhar o +1
-- "grátis" por ganho e passa a ganhar a porcentagem real.

alter table public.user_aura_wallet
  add column if not exists bonus_carry integer not null default 0
    check (bonus_carry >= 0 and bonus_carry < 10000);

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
  v_carry          integer;
  v_raw            bigint;
  v_bonus          integer;
  v_total          integer;
  v_account_tier   text;
  v_vip_expires_at timestamptz;
begin
  if p_base_amount <= 0 then
    return p_base_amount;
  end if;

  select case
    when public.streak_is_alive(
      s.last_completed_date,
      (sh.user_id is not null and sh.consumed_at is null),
      sh.grace_days
    )
    then s.current_streak
    else 0
  end into v_streak_days
  from public.user_streaks s
  left join public.user_streak_shields sh on sh.user_id = s.user_id
  where s.user_id = p_user_id;

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

  -- Garante a linha e a trava antes de ler o carry: dois ganhos simultâneos
  -- do mesmo usuário não podem ler a mesma fração e creditá-la duas vezes.
  insert into public.user_aura_wallet (user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  select bonus_carry into v_carry
  from public.user_aura_wallet
  where user_id = p_user_id
  for update;

  v_raw := coalesce(v_carry, 0)::bigint + p_base_amount::bigint * v_bps;
  v_bonus := (v_raw / 10000)::integer;
  v_total := p_base_amount + v_bonus;

  update public.user_aura_wallet
     set balance     = greatest(balance + v_total, 0),
         bonus_carry = (v_raw % 10000)::integer,
         updated_at  = now()
   where user_id = p_user_id;

  return v_total;
end;
$$;
revoke execute on function public.apply_aura_gain(uuid, integer) from public, anon, authenticated;
grant execute on function public.apply_aura_gain(uuid, integer) to service_role;
