-- Sistema de afiliados: um usuário aprovado pelo admin recebe um código de
-- indicação (`?ref=CODIGO`); vendas da loja atribuídas a ele (via cookie de
-- 30 dias, ver checkout) geram comissão de 5% (flat hoje, mas guardada por
-- afiliado em `commission_bps` — evita nova migration se algum dia deixar de
-- ser flat). Payout é manual (PIX fora do sistema): nem Asaas nem MisticPay
-- têm endpoint de transferência implementado no client atual, então saques
-- são só uma fila que o admin marca como paga.
--
-- IMPORTANTE — aplicar manualmente via Supabase Dashboard (SQL Editor): o
-- histórico de migrations deste projeto está dessincronizado desde 04/08,
-- não rodar via `supabase db push`.

create table if not exists public.affiliates (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null unique references auth.users(id) on delete cascade,
  code              text        unique,   -- só é gerado na aprovação (evita códigos "mortos" de solicitações rejeitadas)
  status            text        not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected', 'suspended')),
  commission_bps    integer     not null default 500 check (commission_bps >= 0 and commission_bps <= 10000),
  balance_cents     integer     not null default 0,   -- cache replicado pelas RPCs a partir do ledger — NUNCA a fonte de verdade
  pix_key           text,
  pix_key_type      text        check (pix_key_type in ('cpf', 'cnpj', 'email', 'phone', 'random')),
  rejection_reason  text,
  reviewed_by       uuid        references public.admin_profiles(id),
  reviewed_at       timestamptz,
  approved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists affiliates_status_idx on public.affiliates (status);

-- Ledger append-only: fonte de verdade do saldo. Nunca faz UPDATE de valor —
-- estorno gera uma linha nova (`refund_debit`) referenciando o crédito
-- original via `related_event_id`, nunca edita a linha existente. `balance_cents`
-- em `affiliates` é só um cache somado nas RPCs que inserem aqui.
create table if not exists public.affiliate_commission_events (
  id                  uuid        primary key default gen_random_uuid(),
  affiliate_id        uuid        not null references public.affiliates(id) on delete cascade,
  order_id            uuid        not null references public.store_orders(id) on delete cascade,
  type                text        not null check (type in ('credit', 'refund_debit', 'adjustment')),
  amount_cents        integer     not null,
  order_total_cents   integer     not null,
  commission_bps      integer     not null,
  related_event_id    uuid        references public.affiliate_commission_events(id),
  note                text,
  created_at          timestamptz not null default now()
);

-- No máximo 1 evento de crédito por pedido — é o mecanismo real de
-- idempotência contra reentrega do webhook do Asaas (constraint de banco,
-- mais forte que só um filtro de UPDATE). `refund_debit` pode se repetir
-- (estornos parciais sucessivos), por isso o índice único é só sobre `credit`.
create unique index if not exists affiliate_commission_events_order_credit_uidx
  on public.affiliate_commission_events (order_id)
  where type = 'credit';

create index if not exists affiliate_commission_events_affiliate_idx
  on public.affiliate_commission_events (affiliate_id, created_at desc);
create index if not exists affiliate_commission_events_order_idx
  on public.affiliate_commission_events (order_id);

create table if not exists public.affiliate_payout_requests (
  id              uuid        primary key default gen_random_uuid(),
  affiliate_id    uuid        not null references public.affiliates(id) on delete cascade,
  amount_cents    integer     not null check (amount_cents > 0),
  status          text        not null default 'requested'
                    check (status in ('requested', 'paid', 'rejected', 'cancelled')),
  -- Snapshot da chave usada NESTE saque — `affiliates.pix_key` pode mudar
  -- depois, mesmo princípio de `store_orders.items` ser snapshot congelado
  -- em vez de FK viva para `store_products`.
  pix_key         text        not null,
  pix_key_type    text        not null check (pix_key_type in ('cpf', 'cnpj', 'email', 'phone', 'random')),
  admin_note      text,
  reviewed_by     uuid        references public.admin_profiles(id),
  reviewed_at     timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists affiliate_payout_requests_affiliate_idx
  on public.affiliate_payout_requests (affiliate_id, created_at desc);
create index if not exists affiliate_payout_requests_status_idx
  on public.affiliate_payout_requests (status);

drop trigger if exists affiliates_updated_at on public.affiliates;
create trigger affiliates_updated_at
  before update on public.affiliates
  for each row execute function public.set_updated_at();

drop trigger if exists affiliate_payout_requests_updated_at on public.affiliate_payout_requests;
create trigger affiliate_payout_requests_updated_at
  before update on public.affiliate_payout_requests
  for each row execute function public.set_updated_at();

-- Sem policies públicas intencionalmente (fail-closed): toda leitura/escrita
-- passa pelo repositório com service-role, ownership sempre resolvido em
-- código a partir do user_id da sessão. Diferente de `market_listings`, aqui
-- não há cenário de leitura pública direta via anon key.
alter table public.affiliates enable row level security;
alter table public.affiliate_commission_events enable row level security;
alter table public.affiliate_payout_requests enable row level security;
