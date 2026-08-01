-- "Lembrar este dispositivo": permite pular o desafio TOTP por até 30 dias
-- num navegador que já completou o 2FA uma vez. Segue as boas práticas do
-- NIST 800-63B (token opaco, aleatório, de vida curta — nunca a senha nem o
-- segredo TOTP) e o princípio de minimização da LGPD (Art. 6, III): só o
-- hash do token é armazenado, o registro expira sozinho e é revogável a
-- qualquer momento pelo usuário (components/account/SecurityTab.tsx).
create table if not exists public.mfa_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create unique index if not exists idx_mfa_trusted_devices_token_hash on public.mfa_trusted_devices(token_hash);
create index if not exists idx_mfa_trusted_devices_user_id on public.mfa_trusted_devices(user_id);

-- Sem policies: assim como `rate_limit_events` (supabase/forum.sql), só o
-- service role (lib/server/repositories/mfa-trusted-devices-repository.ts)
-- lê/escreve esta tabela — RLS habilitada nega tudo mais por padrão.
alter table public.mfa_trusted_devices enable row level security;
