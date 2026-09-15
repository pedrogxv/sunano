-- Ryan (ryantechofc) deixa de ser WEB MASTER e passa a Editor.
--
-- Decisão do dono do site em 2026-09-14: o cargo dele é Editor — Tier List,
-- Tiers e Marcas —, não a matriz total do Web Master.
--
-- Troca `role` E `permissions` juntos, de propósito: a coluna
-- `admin_profiles.permissions` é autorização real no NÍVEL DO BANCO
-- (`admin_has_permission()` em supabase/security.sql lê ela direto nas RLS
-- policies de peripherals, blog, tiers, settings e uploads de storage), então
-- mexer só no `role` deixaria o acesso de Web Master de pé no banco mesmo com
-- o painel já mostrando "Editor". O jsonb abaixo é o espelho exato de
-- `ROLE_PERMISSIONS.editor` em lib/admin-permissions.ts.
--
-- Não mexe em `user_profiles.account_tier`: Editor continua sendo cargo, e
-- todo cargo é VIP automático (ver app/api/admin/users/route.ts).
--
-- Sobre o DISABLE TRIGGER: `trg_guard_admin_profiles_privileged` recusa
-- alteração de role/permissions vinda de quem não é service_role/webmaster, e
-- o `db push` conecta como dono do schema. O disable vale só nesta transação e
-- um rollback o desfaz junto — mesmo padrão de 20261107181628.
--
-- Idempotente: reescreve com valor fixo, e o `audit_log` (mesma linha que a
-- rota /api/admin/users grava numa troca de cargo) só recebe registro quando
-- alguma coisa mudou de fato, então rerodar o arquivo não duplica auditoria.

alter table admin_profiles disable trigger trg_guard_admin_profiles_privileged;

with alvo as (
  select
    'de85833c-70b8-440b-ab10-0202ae869c13'::uuid as id,
    '{
      "dashboard_read": true,
      "peripherals_read": true, "peripherals_write": true,
      "tiers_read": true, "tiers_write": true,
      "brands_read": true, "brands_write": true,
      "profile_read": true, "profile_write": true,
      "blog_read": false, "blog_write": false,
      "forum_read": false, "forum_write": false,
      "settings_read": false, "settings_write": false,
      "maintenance_read": false, "maintenance_write": false,
      "offers_read": false, "offers_write": false,
      "store_read": false, "store_write": false,
      "vip_read": false, "vip_write": false,
      "banners_read": false, "banners_write": false,
      "events_read": false, "events_write": false,
      "affiliates_read": false, "affiliates_write": false,
      "support_read": false, "support_write": false
    }'::jsonb as permissions
),
-- Snapshot do estado anterior: as CTEs deste statement enxergam todas a mesma
-- versão da tabela, então `anterior` continua com os valores de antes do UPDATE.
anterior as (
  select a.id, a.role as previous_role, a.permissions as previous_permissions
  from admin_profiles a
  join alvo on alvo.id = a.id
),
alterado as (
  update admin_profiles a
  set role = 'editor', permissions = alvo.permissions
  from alvo, anterior
  where a.id = alvo.id
    and anterior.id = a.id
    and (a.role is distinct from 'editor' or a.permissions is distinct from alvo.permissions)
  returning
    a.id,
    anterior.previous_role,
    anterior.previous_permissions,
    a.role as new_role,
    a.permissions as new_permissions
)
insert into audit_log (user_id, actor_id, action, table_name, record_id, metadata)
select
  id,
  null,
  'admin_role_changed',
  'admin_profiles',
  id::text,
  jsonb_build_object(
    'previous_role', previous_role,
    'new_role', new_role,
    'previous_permissions', previous_permissions,
    'new_permissions', new_permissions,
    'source', 'migration 20261120000000_ryan_editor_role'
  )
from alterado;

alter table admin_profiles enable trigger trg_guard_admin_profiles_privileged;
