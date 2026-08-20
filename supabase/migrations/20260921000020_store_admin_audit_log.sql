-- Log de auditoria para ações administrativas críticas da Loja: quem fez o
-- quê e quando. Gravado pela camada de aplicação (server-only), nunca a
-- partir de dado enviado pelo frontend — cada rota resolve o admin autor via
-- sessão (getAuthorizedProfile) antes de chamar logAdminAction.
create table if not exists public.store_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.admin_profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists store_admin_audit_log_entity_idx
  on public.store_admin_audit_log (entity_type, entity_id, created_at desc);

create index if not exists store_admin_audit_log_created_idx
  on public.store_admin_audit_log (created_at desc);

-- Admin-only — sem leitura pública. RLS ligado, sem policy: acesso só via
-- service-role, mesmo padrão de store_product_price_history e demais tabelas
-- internas do admin. A restrição a Web Master/Admin na leitura é aplicada na
-- rota da API (hasAdminPermission), não por RLS.
alter table public.store_admin_audit_log enable row level security;

-- Quem alterou cada ponto do histórico de preço — as linhas antigas ficam
-- com changed_by null (não há como atribuir retroativamente).
alter table public.store_product_price_history
  add column if not exists changed_by uuid references public.admin_profiles(id) on delete set null;
