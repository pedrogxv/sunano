-- Preferências de interface persistidas por usuário (tema e idioma).
-- Até então tema/idioma viviam apenas no localStorage do navegador; estas
-- colunas permitem sincronizar a preferência entre dispositivos.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS theme text,
  ADD COLUMN IF NOT EXISTS locale text;
