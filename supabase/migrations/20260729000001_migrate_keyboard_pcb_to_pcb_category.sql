-- Migration: cria a categoria "pcb" e migra para ela os itens que hoje estão
-- cadastrados como "keyboard" mas são, na verdade, PCBs avulsas (vendidas sem
-- switches, para quem monta o próprio teclado).
--
-- Esta migration:
--   1) Remove a CHECK constraint atual de `category`
--   2) Faz backup das linhas que serão migradas (auditoria/rollback manual)
--   3) Atualiza `category` de 'keyboard' para 'pcb' nos itens listados abaixo
--   4) Recria a CHECK constraint incluindo 'pcb' na lista canônica
--
-- Idempotente: se rodar de novo depois que os itens já viraram 'pcb', o UPDATE
-- não encontra mais linhas com category='keyboard' e não faz nada.

BEGIN;

-- 0) Remove a constraint antiga antes de alterar valores
ALTER TABLE peripherals
  DROP CONSTRAINT IF EXISTS peripherals_category_check;

-- 1) Backup das linhas que serão migradas de keyboard -> pcb
CREATE TABLE IF NOT EXISTS backup_peripherals_pcb_category_migration AS
SELECT id, category AS original_category, name, brand, created_at
FROM peripherals
WHERE category = 'keyboard'
  AND name IN (
    'HM64Z He',
    'IceSoul ISO64Lim',
    'NEXUS615',
    'Rakka 60v2 atlas',
    'MM M6U+',
    'MM M6Pro+',
    'Everglide E61 Pro',
    'MM M64 Lite',
    'META60',
    'MM M64'
  )
WITH NO DATA;

INSERT INTO backup_peripherals_pcb_category_migration (id, original_category, name, brand, created_at)
SELECT id, category, name, brand, created_at
FROM peripherals
WHERE category = 'keyboard'
  AND name IN (
    'HM64Z He',
    'IceSoul ISO64Lim',
    'NEXUS615',
    'Rakka 60v2 atlas',
    'MM M6U+',
    'MM M6Pro+',
    'Everglide E61 Pro',
    'MM M64 Lite',
    'META60',
    'MM M64'
  );

-- 2) Migra os itens de 'keyboard' para 'pcb'
UPDATE peripherals
SET category = 'pcb'
WHERE category = 'keyboard'
  AND name IN (
    'HM64Z He',
    'IceSoul ISO64Lim',
    'NEXUS615',
    'Rakka 60v2 atlas',
    'MM M6U+',
    'MM M6Pro+',
    'Everglide E61 Pro',
    'MM M64 Lite',
    'META60',
    'MM M64'
  );

-- 3) Aviso (não bloqueante) se algum dos 10 nomes esperados não foi encontrado
--    como 'keyboard' — pode já ter sido migrado antes, ter nome diferente no
--    banco, ou não existir. Revise manualmente com a query comentada no fim.
DO $$
DECLARE
  migrated_count integer;
BEGIN
  SELECT count(*) INTO migrated_count FROM backup_peripherals_pcb_category_migration;

  IF migrated_count < 10 THEN
    RAISE NOTICE
      'Aviso: apenas % de 10 itens esperados foram migrados de keyboard para pcb. '
      'Confira os nomes no banco (podem ter grafia diferente da lista da migration).',
      migrated_count;
  END IF;
END $$;

-- 4) Recria a CHECK constraint incluindo a nova categoria 'pcb'
ALTER TABLE peripherals
  ADD CONSTRAINT peripherals_category_check
  CHECK (category IN (
    'mouse', 'keyboard', 'pcb', 'mousepad', 'glasspad', 'iem', 'headset',
    'feet', 'chairs', 'monitors', 'switches', 'dac_amp'
  ));

COMMIT;

-- Consultas úteis para conferência pós-execução:
-- SELECT name, category FROM peripherals WHERE category = 'pcb' ORDER BY name;
-- SELECT name FROM backup_peripherals_pcb_category_migration; -- os que foram migrados
-- -- Nomes esperados que NÃO aparecem no backup acima precisam de revisão manual:
-- --   HM64Z He, IceSoul ISO64Lim, NEXUS615, Rakka 60v2 atlas, MM M6U+, MM M6Pro+,
-- --   Everglide E61 Pro, MM M64 Lite, META60, MM M64

-- Nota: execute este arquivo no Supabase SQL Editor ou via psql conectado à sua DB.
