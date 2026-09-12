-- Vendedor perde `vip_write` (mantém `vip_read`).
--
-- Decisão do dono do site em 2026-09-12, durante a auditoria de segurança do
-- módulo VIP: consultar o estado de uma assinatura é atendimento comum e o
-- vendedor precisa disso, mas CONCEDER/REVOGAR acesso pago e cancelar
-- assinatura não são trabalho de vendedor — ficam com webmaster e admin.
--
-- Contexto de risco que motivou a revisão: os WEB MASTERS são VIP por cargo,
-- então um cargo mais baixo com `vip_write` podia agir sobre o VIP dos donos.
-- A rota já ficou protegida por hierarquia de cargo
-- (`lib/server/auth/vip-admin-guard.ts`); esta migration remove o poder na
-- origem, que é a defesa mais forte — o que não se tem não se explora.
--
-- Espelha `ROLE_PERMISSIONS` de `lib/admin-permissions.ts`. A coluna
-- `admin_profiles.permissions` é autorização real no NÍVEL DO BANCO
-- (`admin_has_permission()` a lê nas RLS policies), então ela precisa
-- acompanhar a matriz do TS — mesmo motivo de
-- 20261107170415_vip_admin_permissions.sql.
--
-- Sobre o DISABLE TRIGGER: `trg_guard_admin_profiles_privileged` recusa
-- alteração de `permissions` vinda de quem não é service_role/webmaster, e o
-- `db push` conecta como dono do schema. O disable vale só nesta transação e
-- um rollback o desfaz junto, então o guard nunca fica desligado no banco.
--
-- Idempotente: reescreve as duas chaves com valor fixo a cada execução.

ALTER TABLE admin_profiles DISABLE TRIGGER trg_guard_admin_profiles_privileged;

UPDATE admin_profiles
SET permissions = coalesce(permissions, '{}'::jsonb)
  || CASE role
       WHEN 'webmaster' THEN '{"vip_read": true,  "vip_write": true}'::jsonb
       WHEN 'admin'     THEN '{"vip_read": true,  "vip_write": true}'::jsonb
       -- Só leitura: atendimento consulta, não mexe.
       WHEN 'vendedor'  THEN '{"vip_read": true,  "vip_write": false}'::jsonb
       ELSE                  '{"vip_read": false, "vip_write": false}'::jsonb
     END;

ALTER TABLE admin_profiles ENABLE TRIGGER trg_guard_admin_profiles_privileged;
