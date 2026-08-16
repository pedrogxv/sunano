-- Nova trilha de conquistas "aura_earned" (Aura farmada) — baseada no total
-- histórico de Aura ganha, não no saldo atual (`user_aura_wallet.balance`),
-- que cai quando o usuário resgata medalhas via `aura_redeem` (ver
-- 20260816_aura_redeem_events.sql). Precisa de um contador que só sobe.
--
-- Progressão pedida (diferente dos 5 níveis padrão 1/10/50/100/1000 das
-- trilhas posts/comments/followers, ver 20260808_achievements_streak.sql):
-- bronze 10, silver 300, gold 1000, platinum 10000, diamond 50000.

-- ────────────────────────────────────────────
-- 1. `achievements.threshold` já é por linha (não por tier global), então a
--    trilha nova só precisa ser incluída no `check` de `track` — os
--    thresholds diferentes já são suportados sem mudança de schema.
-- ────────────────────────────────────────────
alter table public.achievements
  drop constraint if exists achievements_track_check,
  add constraint achievements_track_check
    check (track in ('posts', 'comments', 'followers', 'aura_earned'));

-- ────────────────────────────────────────────
-- 2. Contador que só sobe: soma de todo `delta > 0` já creditado ao usuário
--    em `aura_ledger`, mantida por trigger (evita `sum()` a cada checagem).
-- ────────────────────────────────────────────
alter table public.user_aura_wallet
  add column if not exists total_earned integer not null default 0 check (total_earned >= 0);

-- Backfill: soma histórica de tudo que já foi creditado até aqui.
update public.user_aura_wallet w
set total_earned = coalesce(t.sum_positive, 0)
from (
  select user_id, sum(delta) as sum_positive
  from public.aura_ledger
  where delta > 0
  group by user_id
) t
where t.user_id = w.user_id;

create or replace function public.track_aura_total_earned()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.delta > 0 then
    insert into public.user_aura_wallet (user_id, total_earned)
    values (new.user_id, new.delta)
    on conflict (user_id) do update
      set total_earned = user_aura_wallet.total_earned + new.delta, updated_at = now();

    perform public.check_and_award_track_achievements(
      new.user_id,
      'aura_earned',
      (select total_earned from public.user_aura_wallet where user_id = new.user_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_track_aura_total_earned on public.aura_ledger;
create trigger trg_track_aura_total_earned
  after insert on public.aura_ledger
  for each row execute function public.track_aura_total_earned();

-- ────────────────────────────────────────────
-- 3. Catálogo da trilha — mesma tabela/função de concessão de
--    20260808_achievements_streak.sql, só thresholds e nomes novos.
-- ────────────────────────────────────────────
insert into public.achievements (slug, track, tier, threshold, name, description, aura_reward) values
  ('aura_earned_bronze',   'aura_earned', 'bronze',   10,    'Brasa',        '10 de Aura farmada.',      10),
  ('aura_earned_silver',   'aura_earned', 'silver',   300,   'Chama',        '300 de Aura farmada.',     25),
  ('aura_earned_gold',     'aura_earned', 'gold',     1000,  'Fogueira',     '1.000 de Aura farmada.',   50),
  ('aura_earned_platinum', 'aura_earned', 'platinum', 10000, 'Incêndio',     '10.000 de Aura farmada.',  100),
  ('aura_earned_diamond',  'aura_earned', 'diamond',  50000, 'Supernova',    '50.000 de Aura farmada.',  250)
on conflict (slug) do nothing;

-- ────────────────────────────────────────────
-- 4. Backfill retroativo: concede a quem já tem `total_earned` suficiente
--    (mesmo espírito de 20260808120000_achievements_backfill.sql).
-- ────────────────────────────────────────────
do $$
declare
  v_wallet record;
begin
  for v_wallet in select user_id, total_earned from public.user_aura_wallet where total_earned > 0
  loop
    perform public.check_and_award_track_achievements(v_wallet.user_id, 'aura_earned', v_wallet.total_earned);
  end loop;
end;
$$;
