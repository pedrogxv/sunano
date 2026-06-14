-- Conformidade com a LGPD (Lei Geral de Proteção de Dados — Lei 13.709/2018)
-- Este script adiciona:
--   1. Campos de consentimento LGPD na tabela user_profiles
--   2. Tabela audit_log para rastreabilidade de operações sobre dados pessoais
--   3. Função de anonimização usada no exercício do direito de apagamento

-- ────────────────────────────────────────────
-- 1. Consentimento LGPD em user_profiles
-- ────────────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS lgpd_consent_at   timestamptz,
  ADD COLUMN IF NOT EXISTS lgpd_consent_version text;

COMMENT ON COLUMN user_profiles.lgpd_consent_at IS
  'Data/hora em que o usuário aceitou a Política de Privacidade (LGPD Art. 7 e Art. 8).';
COMMENT ON COLUMN user_profiles.lgpd_consent_version IS
  'Versão da Política de Privacidade aceita (ex: "2026-06").';

-- ────────────────────────────────────────────
-- 2. Tabela de log de auditoria (LGPD Art. 37)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,                       -- titular dos dados (pode ser nulo em ops sistêmicas)
  actor_id    uuid,                       -- quem realizou a operação (pode ser o próprio usuário ou um admin)
  action      text NOT NULL,              -- ex: 'account_deleted', 'data_exported', 'consent_recorded'
  table_name  text,                       -- tabela afetada (opcional)
  record_id   text,                       -- id do registro afetado (opcional)
  metadata    jsonb NOT NULL DEFAULT '{}', -- detalhes adicionais
  ip_address  text,                       -- endereço IP do solicitante
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_log IS
  'Registro de auditoria de operações sobre dados pessoais — LGPD Art. 37.';

-- Índices para consultas de auditoria
CREATE INDEX IF NOT EXISTS audit_log_user_id_idx    ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx   ON audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx     ON audit_log (action);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);

-- RLS: somente service_role pode escrever; leitura restrita a admins via service_role
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_service_role_all" ON audit_log
  FOR ALL
  USING (false)       -- bloqueia acesso direto por qualquer role
  WITH CHECK (false); -- só service_role (bypass RLS) pode escrever

-- ────────────────────────────────────────────
-- 3. Função: anonimizar dados de um usuário
--    Usada no direito ao apagamento (Art. 18, VI)
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION anonymize_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Anonimiza posts do fórum: remove e-mail do autor (mantém conteúdo para integridade do fórum)
  UPDATE forum_posts
  SET author_email = NULL,
      author_name  = '[usuário removido]'
  WHERE user_id = p_user_id;

  -- Anonimiza comentários do fórum
  UPDATE forum_comments
  SET author_email = NULL,
      author_name  = '[usuário removido]'
  WHERE user_id = p_user_id;

  -- Anonimiza pedidos da loja: remove nome e e-mail do cliente
  -- (mantém o pedido para fins fiscais/contábeis — LGPD Art. 16, II)
  UPDATE store_orders
  SET customer_email = NULL,
      customer_name  = NULL
  WHERE metadata->>'user_id' = p_user_id::text;
END;
$$;
