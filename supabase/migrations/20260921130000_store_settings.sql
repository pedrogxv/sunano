-- store_settings: configuração da Loja editável pelo admin (webmaster),
-- não por env var — hoje só o acréscimo do cartão e o teto de parcelas.
-- Linha única (id fixo) — é um "singleton" de configuração, não uma tabela
-- de N configs; evita criar uma tabela key/value genérica que exigiria
-- parse de tipo em toda leitura.
create table if not exists public.store_settings (
  id boolean primary key default true,
  card_surcharge_percent numeric(5,2) not null default 5.00,
  card_max_installments integer not null default 12,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_profiles(id) on delete set null
);

alter table public.store_settings
  drop constraint if exists store_settings_single_row;
alter table public.store_settings
  add constraint store_settings_single_row check (id = true);

alter table public.store_settings
  drop constraint if exists store_settings_card_surcharge_percent_check;
alter table public.store_settings
  add constraint store_settings_card_surcharge_percent_check
  check (card_surcharge_percent >= 0 and card_surcharge_percent <= 100);

alter table public.store_settings
  drop constraint if exists store_settings_card_max_installments_check;
alter table public.store_settings
  add constraint store_settings_card_max_installments_check
  check (card_max_installments >= 1 and card_max_installments <= 21);

insert into public.store_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists store_settings_updated_at on public.store_settings;
create trigger store_settings_updated_at
  before update on public.store_settings
  for each row execute function public.set_updated_at();

-- RLS ligado, SEM policy pública — mesmo padrão de store_admin_audit_log e
-- demais tabelas internas do admin. Leitura/escrita só via service-role
-- (createSupabaseAdminClient); o valor efetivo chega ao navegador via
-- /api/store/settings, nunca por query direta na tabela.
alter table public.store_settings enable row level security;
