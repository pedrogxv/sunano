-- "Aura farmada" (`user_aura_wallet.total_earned`, a trilha de conquistas
-- criada em 20260919000000_aura_earned_achievements.sql) para de contar a
-- Aura recebida como recompensa de conquista.
--
-- O contador era alimentado por trigger em TODO `aura_ledger.delta > 0` — e a
-- recompensa da própria trilha entra no ledger como delta positivo. Ou seja:
-- farmar aura destravava "Brasa", "Brasa" pagava 10 de aura, e esses 10
-- empurravam o contador rumo a "Chama". O laço é limitado (10 -> 300 -> 1000
-- -> 10000 -> 50000, com recompensas de 10 a 250, que nunca cobrem a distância
-- até o nível seguinte), então nunca virou aura infinita, mas o número deixava
-- de medir o que o nome diz: quanto o usuário farmou por atividade.
--
-- Era também a origem da reentrância que fazia `check_and_award_track_
-- achievements` reentrar em si mesma no meio do próprio loop (ver
-- 20260930000000_aura_fixed_rewards.sql, seção 2). Com o filtro abaixo a
-- concessão de conquista não dispara mais nova checagem, e as duas correções
-- ficam independentes uma da outra.
--
-- Ninguém perde conquista já desbloqueada: `user_achievements` não é tocada
-- aqui, e a função de concessão nunca revoga. O que muda é o número exibido
-- e a barra de progresso até o próximo nível.

create or replace function public.track_aura_total_earned()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.delta <= 0 or new.reason = 'achievement_unlocked' then
    return new;
  end if;

  insert into public.user_aura_wallet (user_id, total_earned)
  values (new.user_id, new.delta)
  on conflict (user_id) do update
    set total_earned = user_aura_wallet.total_earned + new.delta, updated_at = now();

  perform public.check_and_award_track_achievements(
    new.user_id,
    'aura_earned',
    (select total_earned from public.user_aura_wallet where user_id = new.user_id)
  );

  return new;
end;
$$;

-- Recalcula o histórico com a regra nova. `reason` é `not null`
-- (20260806_forum_aura.sql), então o `<>` cobre todas as linhas; o
-- `coalesce` é para carteira sem nenhum ganho no ledger, que precisa ir a
-- zero em vez de manter o valor inflado.
update public.user_aura_wallet w
set total_earned = coalesce((
  select sum(l.delta)
  from public.aura_ledger l
  where l.user_id = w.user_id
    and l.delta > 0
    and l.reason <> 'achievement_unlocked'
), 0);
