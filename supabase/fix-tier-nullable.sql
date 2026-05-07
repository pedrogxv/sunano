-- Permite NULL na coluna tier da tabela peripherals
ALTER TABLE public.peripherals
DROP CONSTRAINT peripherals_tier_check;

ALTER TABLE public.peripherals
ALTER COLUMN tier DROP NOT NULL;

ALTER TABLE public.peripherals
ADD CONSTRAINT peripherals_tier_check
  CHECK (tier IS NULL OR tier IN ('GOAT', 'SS', 'S', 'A', 'B', 'C', 'L'));
