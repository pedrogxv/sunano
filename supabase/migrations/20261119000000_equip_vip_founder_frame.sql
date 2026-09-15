-- Recuperado de supabase_migrations.schema_migrations (aplicada em produção
-- sem o arquivo correspondente no repo). Conteúdo exatamente o que rodou no
-- banco; não re-executa, a versão já consta como aplicada no remoto.

-- Equipa a Moldura de Fundador para quem já a possui e não escolheu nada.
--
-- POR QUÊ
-- -------
-- A moldura só aparece no site inteiro quando está EQUIPADA (é o slot
-- `user_profiles.equipped_avatar_frame_id` que todas as telas leem — ver
-- `resolveProfileFrame` em `lib/profile-frames.ts`). O sistema de equipar
-- acabou de nascer: na hora desta migration, ZERO perfis do site tinham
-- qualquer moldura equipada. Ou seja, os 19 fundadores do backfill anterior
-- (`20261118000000`) tinham a posse, mas nenhum avatar mostrava nada — a
-- honraria existia só no banco.
--
-- Equipar automaticamente aqui não tira escolha de ninguém: não há escolha
-- feita para sobrescrever. A partir de agora a pessoa pode trocar quando
-- quiser na Central de Aura.
--
-- A TRAVA QUE IMPORTA
-- -------------------
-- `equipped_avatar_frame_id is null` — só preenche slot VAZIO. Sem isso, uma
-- reexecução (ou o dia em que alguém já tiver comprado e equipado uma
-- cosmética) apagaria a escolha do dono e devolveria a de Fundador por cima,
-- que é exatamente o oposto da precedência do módulo ("a equipada ganha de
-- tudo").
--
-- Isto é um BACKFILL de uma vez, não uma regra: quem virar VIP daqui para a
-- frente recebe a posse pelo trigger de `20261118000000` e equipa se quiser.
-- Conceder não é equipar — ver o comentário de `RANK_FRAMES`, que é o mesmo
-- princípio.

do $$
declare
  v_item_id uuid;
  v_count   integer;
begin
  select id into v_item_id from public.aura_items where slug = 'vip:founder';

  if v_item_id is null then
    raise exception 'Item vip:founder não encontrado — 20261118000000 não foi aplicada.';
  end if;

  update public.user_profiles p
  set equipped_avatar_frame_id = v_item_id
  from public.user_aura_items ua
  where ua.user_id = p.id
    and ua.item_id = v_item_id
    and p.equipped_avatar_frame_id is null;

  get diagnostics v_count = row_count;
  raise notice 'Moldura Fundador equipada para % fundadores sem moldura escolhida.', v_count;
end $$;
