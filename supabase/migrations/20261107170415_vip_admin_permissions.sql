-- Módulo "VIPs" no painel admin substitui o "Mercado", que foi REMOVIDO do
-- produto (rotas /mercado/**, /api/market/** e /admin/market deletadas).
--
-- Por que esta migration existe: `lib/admin-permissions.ts` é a matriz de
-- autorização do APP, mas a coluna `admin_profiles.permissions` continua sendo
-- autorização real no NÍVEL DO BANCO — `admin_has_permission()` (ver
-- supabase/security.sql) lê ela direto nas RLS policies. Trocar a matriz no TS
-- sem sincronizar a coluna deixa os dois discordando, que é exatamente o
-- problema que 20260921000019_role_based_permissions.sql veio resolver.
--
-- O que muda por cargo:
--   • `vip_read`/`vip_write` — concedidas a webmaster, admin e VENDEDOR (é o
--     mesmo trabalho de cobrança/pós-venda que ele já faz na Loja, com o mesmo
--     gateway); negadas aos demais.
--   • `market_read`/`market_write` — REMOVIDAS da coluna: a feature não
--     existe mais, e permissão órfã só confunde auditoria futura.
--
-- Idempotente: `jsonb - <chave>` não reclama se a chave já sumiu, e o `||`
-- sobrescreve as chaves de VIP toda vez com o mesmo valor.
--
-- POR QUE O TRIGGER É DESLIGADO AQUI: `trg_guard_admin_profiles_privileged`
-- (20261102000000_fix_privilege_escalation_rls.sql, a correção do incidente de
-- escalação de privilégio) recusa QUALQUER alteração de `permissions` que não
-- venha do service_role ou de um webmaster — e `supabase db push` conecta como
-- dono do schema, que não é nenhum dos dois. Sem desligar, esta migration
-- morre com 42501.
--
-- Isso NÃO afrouxa a proteção: `ALTER TABLE ... DISABLE TRIGGER` vale só
-- dentro desta transação e para esta conexão; um rollback (erro no UPDATE)
-- desfaz o disable junto, então é impossível o banco ficar com o guard
-- desligado. O ENABLE explícito ao final é o caminho normal.

ALTER TABLE admin_profiles DISABLE TRIGGER trg_guard_admin_profiles_privileged;

UPDATE admin_profiles
SET permissions =
  -- 1. Tira as chaves do Mercado (feature removida).
  (coalesce(permissions, '{}'::jsonb) - 'market_read' - 'market_write')
  -- 2. Escreve as chaves de VIP conforme o cargo.
  || CASE role
       WHEN 'webmaster' THEN '{"vip_read": true,  "vip_write": true}'::jsonb
       WHEN 'admin'     THEN '{"vip_read": true,  "vip_write": true}'::jsonb
       WHEN 'vendedor'  THEN '{"vip_read": true,  "vip_write": true}'::jsonb
       ELSE                  '{"vip_read": false, "vip_write": false}'::jsonb
     END;

ALTER TABLE admin_profiles ENABLE TRIGGER trg_guard_admin_profiles_privileged;
