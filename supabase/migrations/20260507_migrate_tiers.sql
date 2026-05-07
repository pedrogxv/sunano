-- Migration: Mapeia tiers antigos (T0, T0.5, T1, T2) para os novos (GOAT, SS, S, A)
-- Cria backup dos registros afetados, executa as atualizações e valida.

BEGIN;

-- 0) Remove a constraint antiga antes de alterar os valores
ALTER TABLE peripherals
  DROP CONSTRAINT IF EXISTS peripherals_tier_check;

-- 1) Backup dos registros que serão alterados
CREATE TABLE IF NOT EXISTS backup_peripherals_tier_migration AS
SELECT id, tier, specs, created_at
FROM peripherals
WHERE tier IN ('T0','T0.5','T1','T2')
   OR (specs->'details'->>'rankLabel') IN ('T0','T0.5','T1','T2');

-- 2) Atualiza a coluna `tier`
UPDATE peripherals
SET tier = CASE tier
  WHEN 'T0' THEN 'GOAT'
  WHEN 'T0.5' THEN 'SS'
  WHEN 'T1' THEN 'S'
  WHEN 'T2' THEN 'A'
  ELSE tier END
WHERE tier IN ('T0','T0.5','T1','T2');

-- 3) Atualiza specs->details->rankLabel quando presente
UPDATE peripherals
SET specs = jsonb_set(specs, '{details,rankLabel}', to_jsonb(
  CASE specs->'details'->> 'rankLabel'
    WHEN 'T0' THEN 'GOAT'
    WHEN 'T0.5' THEN 'SS'
    WHEN 'T1' THEN 'S'
    WHEN 'T2' THEN 'A'
    ELSE specs->'details'->> 'rankLabel'
  END
))
WHERE specs IS NOT NULL
  AND (specs->'details'->> 'rankLabel') IN ('T0','T0.5','T1','T2');

-- 4) Recria a constraint da coluna tier para aceitar os novos valores (e NULL)
ALTER TABLE peripherals
  ADD CONSTRAINT peripherals_tier_check
  CHECK (tier IS NULL OR tier IN ('GOAT', 'SS', 'S', 'A', 'B', 'C', 'L'));

-- 5) Confirmação simples: contagem antes/depois (opcional)
-- SELECT count(*) FROM backup_peripherals_tier_migration;
-- SELECT tier, count(*) FROM peripherals GROUP BY tier ORDER BY count DESC;

COMMIT;

-- Nota: execute este arquivo no Supabase SQL editor ou via psql conectado à sua DB.
