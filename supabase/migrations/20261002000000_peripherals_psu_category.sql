-- Adiciona a categoria "psu" (Fontes) ao catálogo de periféricos.
--
-- `peripherals.category` é texto com CHECK constraint (não enum), então a única
-- coisa a fazer é recriar a lista incluindo o novo valor. A lista abaixo repete
-- integralmente a de 20260729000001_migrate_keyboard_pcb_to_pcb_category.sql —
-- se alguma categoria for adicionada direto em produção fora do versionamento,
-- conferir antes de rodar, senão este ALTER a remove.
--
-- Não mexe em `tier`: Fontes reaproveitam os mesmos valores GOAT..L, só que sem
-- usar o SS e exibindo "L" como BOMBA na interface (ver lib/tier-utils.ts).

BEGIN;

ALTER TABLE peripherals
  DROP CONSTRAINT IF EXISTS peripherals_category_check;

ALTER TABLE peripherals
  ADD CONSTRAINT peripherals_category_check
  CHECK (category IN (
    'mouse', 'keyboard', 'pcb', 'mousepad', 'glasspad', 'iem', 'headset',
    'feet', 'chairs', 'monitors', 'switches', 'dac_amp', 'psu'
  ));

COMMIT;

-- Conferência pós-execução:
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'peripherals_category_check';
