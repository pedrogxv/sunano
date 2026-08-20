-- Permissões deixam de ser configuráveis por usuário e passam a ser fixas por
-- cargo (lib/admin-permissions.ts define a matriz e a aplica nas leituras/
-- escritas da API a partir de agora). Mas a coluna admin_profiles.permissions
-- CONTINUA sendo autorização real no nível do banco: admin_has_permission()
-- em supabase/security.sql lê ela direto nas RLS policies de peripherals,
-- blog, tiers, settings e uploads de storage. Esta migration precisa rodar em
-- produção pra sincronizar a coluna com a matriz nova — sem ela, RLS continua
-- liberando/bloqueando conforme a matriz antiga (ex: Editor ainda teria
-- blog_write pelo banco mesmo sem a tela; Moderador não conseguiria salvar em
-- Blog mesmo com a UI liberada).
UPDATE admin_profiles
SET permissions = CASE role
  WHEN 'webmaster' THEN '{
    "dashboard_read": true, "peripherals_read": true, "peripherals_write": true,
    "blog_read": true, "blog_write": true, "forum_read": true, "forum_write": true,
    "settings_read": true, "settings_write": true, "tiers_read": true, "tiers_write": true,
    "profile_read": true, "profile_write": true, "maintenance_read": true, "maintenance_write": true,
    "offers_read": true, "offers_write": true, "store_read": true, "store_write": true,
    "market_read": true, "market_write": true, "banners_read": true, "banners_write": true,
    "events_read": true, "events_write": true, "brands_read": true, "brands_write": true,
    "affiliates_read": true, "affiliates_write": true, "support_read": true, "support_write": true
  }'::jsonb
  WHEN 'admin' THEN '{
    "dashboard_read": true, "peripherals_read": true, "peripherals_write": true,
    "blog_read": true, "blog_write": true, "forum_read": true, "forum_write": true,
    "settings_read": true, "settings_write": true, "tiers_read": true, "tiers_write": true,
    "profile_read": true, "profile_write": true, "maintenance_read": true, "maintenance_write": true,
    "offers_read": true, "offers_write": true, "store_read": true, "store_write": true,
    "market_read": true, "market_write": true, "banners_read": true, "banners_write": true,
    "events_read": true, "events_write": true, "brands_read": true, "brands_write": true,
    "affiliates_read": true, "affiliates_write": true, "support_read": true, "support_write": true
  }'::jsonb
  -- Moderador: gerencia e vigia a comunidade — só Fórum e Blog.
  WHEN 'moderator' THEN '{
    "dashboard_read": true, "peripherals_read": false, "peripherals_write": false,
    "blog_read": true, "blog_write": true, "forum_read": true, "forum_write": true,
    "settings_read": false, "settings_write": false, "tiers_read": false, "tiers_write": false,
    "profile_read": true, "profile_write": true, "maintenance_read": false, "maintenance_write": false,
    "offers_read": false, "offers_write": false, "store_read": false, "store_write": false,
    "market_read": false, "market_write": false, "banners_read": false, "banners_write": false,
    "events_read": false, "events_write": false, "brands_read": false, "brands_write": false,
    "affiliates_read": false, "affiliates_write": false, "support_read": false, "support_write": false
  }'::jsonb
  -- Editor: guias da comunidade + Tierlist/Periféricos — Tier List, Tiers e Marcas.
  WHEN 'editor' THEN '{
    "dashboard_read": true, "peripherals_read": true, "peripherals_write": true,
    "blog_read": false, "blog_write": false, "forum_read": false, "forum_write": false,
    "settings_read": false, "settings_write": false, "tiers_read": true, "tiers_write": true,
    "profile_read": true, "profile_write": true, "maintenance_read": false, "maintenance_write": false,
    "offers_read": false, "offers_write": false, "store_read": false, "store_write": false,
    "market_read": false, "market_write": false, "banners_read": false, "banners_write": false,
    "events_read": false, "events_write": false, "brands_read": true, "brands_write": true,
    "affiliates_read": false, "affiliates_write": false, "support_read": false, "support_write": false
  }'::jsonb
  -- Vendedor: gestão da loja — Loja/Bazar (módulo "store") e Tickets (módulo "support").
  WHEN 'vendedor' THEN '{
    "dashboard_read": true, "peripherals_read": false, "peripherals_write": false,
    "blog_read": false, "blog_write": false, "forum_read": false, "forum_write": false,
    "settings_read": false, "settings_write": false, "tiers_read": false, "tiers_write": false,
    "profile_read": true, "profile_write": true, "maintenance_read": false, "maintenance_write": false,
    "offers_read": false, "offers_write": false, "store_read": true, "store_write": true,
    "market_read": false, "market_write": false, "banners_read": false, "banners_write": false,
    "events_read": false, "events_write": false, "brands_read": false, "brands_write": false,
    "affiliates_read": false, "affiliates_write": false, "support_read": true, "support_write": true
  }'::jsonb
  -- Suporte: beta tester que silencia/apaga postagens e apazigua conflitos em
  -- Fórum e Blog. O sistema não distingue "moderação leve" de edição completa
  -- dentro do módulo, então aplica-se Leitura e Edição completas ali.
  WHEN 'suporte' THEN '{
    "dashboard_read": true, "peripherals_read": false, "peripherals_write": false,
    "blog_read": true, "blog_write": true, "forum_read": true, "forum_write": true,
    "settings_read": false, "settings_write": false, "tiers_read": false, "tiers_write": false,
    "profile_read": true, "profile_write": true, "maintenance_read": false, "maintenance_write": false,
    "offers_read": false, "offers_write": false, "store_read": false, "store_write": false,
    "market_read": false, "market_write": false, "banners_read": false, "banners_write": false,
    "events_read": false, "events_write": false, "brands_read": false, "brands_write": false,
    "affiliates_read": false, "affiliates_write": false, "support_read": false, "support_write": false
  }'::jsonb
  ELSE permissions
END
WHERE role IN ('webmaster', 'admin', 'moderator', 'editor', 'vendedor', 'suporte');
