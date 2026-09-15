-- Recuperado de supabase_migrations.schema_migrations (aplicada em produção
-- sem o arquivo correspondente no repo). Conteúdo exatamente o que rodou no
-- banco; não re-executa, a versão já consta como aplicada no remoto.

-- Molduras de ranking deixam de ser concedidas automaticamente.
--
-- POR QUÊ
-- -------
-- Enquanto o sistema de EQUIPAR não está lançado, ninguém escolhe a própria
-- moldura — então conceder por colocação significava que o avatar mostrava
-- algo que o dono não pediu e não pode trocar. Além disso o placar de
-- ofensiva é raso (2º e 3º lugar com ZERO dia), o que dava "moldura de pódio"
-- a quem não fez nada.
--
-- A partir daqui um avatar só mostra a moldura EQUIPADA ou, na falta dela, a
-- de VIP para quem assina (ver `resolveProfileFrame` em
-- `lib/profile-frames.ts`). As linhas de rank continuam no catálogo como
-- prévia da loja e como destino da posse quando a concessão for ligada.
--
-- As molduras de ofensiva saem do catálogo da vitrine também: nasceram com
-- fogo e rampa quente, idênticas às de Aura — não dava para saber de qual
-- ranking eram.
update public.aura_items
set description = description || ' (ainda não concedida: ver lib/profile-frames.ts)'
where slug like 'rank:%'
  and description not like '%ainda não concedida%';

-- Trava de segurança: nada deveria ter sido concedido (as linhas nasceram
-- `active = false` e `redeem_aura_item` recusa item não-comprável), mas se
-- algum slot apontar para uma moldura de rank, ele é limpo — senão sobra
-- referência a uma moldura que o código não desenha mais.
update public.user_profiles p
set equipped_avatar_frame_id = null
from public.aura_items i
where p.equipped_avatar_frame_id = i.id
  and i.slug like 'rank:%';
