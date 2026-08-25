-- Linter do Supabase: `public.vip_subscription_payments` está exposta ao
-- PostgREST sem RLS (a migration 20260922000003 habilitou em
-- `vip_subscriptions`, mas esqueceu a tabela de idempotência).
--
-- Sem policy nenhuma de propósito: a tabela só é lida/escrita pelas RPCs
-- `security definer` de 20260922000004 (dono da função ignora RLS) e pelo
-- service_role no webhook da Asaas. Com RLS ligada e zero policies, anon e
-- authenticated ficam sem acesso via API — que é o comportamento desejado,
-- já que são IDs de cobrança de terceiros.
alter table public.vip_subscription_payments enable row level security;
