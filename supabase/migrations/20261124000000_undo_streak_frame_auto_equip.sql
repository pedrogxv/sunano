-- Desfaz o auto-equipar das molduras de Ofensiva.
--
-- O QUE ACONTECEU
-- ---------------
-- A seção 6 de `20261121000000_streak_milestone_frames.sql` equipou a moldura
-- do maior marco para todo mundo que tinha o slot vazio — copiando o backfill
-- de Fundador (`20261119000000`). Os dois casos NÃO são iguais:
--
--   Fundador é uma honraria de assinatura, e já entra no fallback de
--   precedência de `resolveProfileFrame` (Fundador > VIP). Equipá-la só
--   materializa no slot o que a pessoa já exibiria de qualquer jeito.
--
--   Ofensiva NÃO entra no fallback (ver AGENTS.md: "conceder é só dar o
--   direito de EQUIPAR"). E o marco mais baixo é de 1 dia — então o backfill
--   emoldurou 21 pessoas que só completaram as missões de um único dia, sem
--   nunca terem escolhido nada, várias delas com a pílula "Sem ofensiva" ao
--   lado porque o direito sai do RECORDE e a sequência viva era 0.
--
-- A POSSE FICA. Só o slot é limpo: quem tem o marco continua com a linha em
-- `user_aura_items` e pode equipar no editor de perfil quando quiser.
--
-- Não mexe em `avatar_frame_opt_out`: quem nunca escolheu volta a
-- `equipped_avatar_frame_id is null`, que é "nunca escolhi" e cai no fallback
-- de honraria (Fundador > VIP) — exatamente o estado de antes do backfill.
do $$
declare
  v_count integer;
begin
  update public.user_profiles p
  set equipped_avatar_frame_id = null
  from public.aura_items i
  where i.id = p.equipped_avatar_frame_id
    and i.slug like 'streak:%';

  get diagnostics v_count = row_count;
  raise notice 'Molduras de Ofensiva desequipadas: %.', v_count;
end $$;
