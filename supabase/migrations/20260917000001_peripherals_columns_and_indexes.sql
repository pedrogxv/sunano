-- Extrai campos de `peripherals.specs` (jsonb) para colunas reais indexáveis,
-- para permitir filtro/paginação server-side (.range()) sem escanear jsonb.
-- Aditiva: `specs` continua existindo e sendo a fonte legada durante a
-- transição (dual-write no form admin até os consumidores migrarem).
--
-- Sem CHECK/enum nas colunas novas por ora: os valores vêm de <Select> no
-- client mas nunca tiveram constraint no banco, e o histórico do projeto
-- (20260515_migrate_peripheral_categories.sql, 20260729_..._pcb_category.sql)
-- mostra que dado sujo já entrou por fora do form mesmo em colunas COM CHECK.
-- Adicionar constraint aqui bloquearia esta migration no primeiro valor fora
-- do esperado. Reavaliar depois de um período de observação em produção.
--
-- IMPORTANTE — aplicar manualmente via Supabase Dashboard (SQL Editor): o
-- histórico de migrations deste projeto está dessincronizado desde 04/08,
-- não rodar via `supabase db push` (mesmo caso de 20260901000000_peripheral_reviews.sql).

BEGIN;

ALTER TABLE peripherals
  ADD COLUMN IF NOT EXISTS weight_g integer,
  ADD COLUMN IF NOT EXISTS connectivity text,
  ADD COLUMN IF NOT EXISTS mouse_shape text,
  ADD COLUMN IF NOT EXISTS keyboard_layout text,
  ADD COLUMN IF NOT EXISTS surface text,
  ADD COLUMN IF NOT EXISTS profile text,
  ADD COLUMN IF NOT EXISTS panel_type text,
  ADD COLUMN IF NOT EXISTS refresh_rate integer,
  ADD COLUMN IF NOT EXISTS tier_rank smallint;

-- Backfill: weight_g a partir de specs.details.weight (texto livre "61g", "800 g")
UPDATE peripherals
SET weight_g = round((regexp_match(specs->'details'->>'weight', '(\d+(?:\.\d+)?)'))[1]::numeric)
WHERE weight_g IS NULL
  AND specs->'details'->>'weight' IS NOT NULL
  AND specs->'details'->>'weight' ~ '\d';

-- Backfill: campos de topo de specs (raiz, não details)
UPDATE peripherals SET connectivity = specs->>'connectivity'
  WHERE connectivity IS NULL AND specs->>'connectivity' IS NOT NULL;

UPDATE peripherals SET mouse_shape = specs->>'mouseShape'
  WHERE mouse_shape IS NULL AND specs->>'mouseShape' IS NOT NULL;

UPDATE peripherals SET keyboard_layout = specs->>'keyboardLayout'
  WHERE keyboard_layout IS NULL AND specs->>'keyboardLayout' IS NOT NULL;

UPDATE peripherals SET surface = specs->>'surface'
  WHERE surface IS NULL AND specs->>'surface' IS NOT NULL;

UPDATE peripherals SET profile = specs->>'profile'
  WHERE profile IS NULL AND specs->>'profile' IS NOT NULL;

UPDATE peripherals SET panel_type = specs->>'panelType'
  WHERE panel_type IS NULL AND specs->>'panelType' IS NOT NULL;

-- refreshRate normalmente já é number no jsonb, mas cobre linhas legadas em string.
UPDATE peripherals
SET refresh_rate = CASE jsonb_typeof(specs->'refreshRate')
  WHEN 'number' THEN (specs->>'refreshRate')::numeric::integer
  WHEN 'string' THEN NULLIF(regexp_replace(specs->>'refreshRate', '[^0-9]', '', 'g'), '')::integer
  ELSE NULL
END
WHERE refresh_rate IS NULL AND specs->'refreshRate' IS NOT NULL;

-- tier_rank: ordem numérica auxiliar para permitir ORDER BY no banco (tier
-- não é alfabético: GOAT > SS > S > A > B > C > L).
UPDATE peripherals SET tier_rank = CASE tier
  WHEN 'GOAT' THEN 0 WHEN 'SS' THEN 1 WHEN 'S' THEN 2 WHEN 'A' THEN 3
  WHEN 'B' THEN 4 WHEN 'C' THEN 5 WHEN 'L' THEN 6 ELSE NULL END
WHERE tier_rank IS NULL AND tier IS NOT NULL;

-- Índices para as queries paginadas
CREATE INDEX IF NOT EXISTS idx_peripherals_category ON peripherals (category);
CREATE INDEX IF NOT EXISTS idx_peripherals_category_created_at ON peripherals (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_peripherals_tier_rank ON peripherals (tier_rank);
CREATE INDEX IF NOT EXISTS idx_peripherals_price ON peripherals (price);
CREATE INDEX IF NOT EXISTS idx_peripherals_tags_gin ON peripherals USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_store_products_active_created_at ON store_products (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_products_category ON store_products (category);
CREATE INDEX IF NOT EXISTS idx_store_products_price_cents ON store_products (price_cents);

COMMIT;

-- Conferência pós-backfill (rodar manualmente):
-- SELECT count(*) FROM peripherals WHERE weight_g IS NULL AND specs->'details'->>'weight' IS NOT NULL;
-- SELECT id, name, specs->'details'->>'weight' FROM peripherals WHERE weight_g IS NULL AND specs->'details'->>'weight' IS NOT NULL;
