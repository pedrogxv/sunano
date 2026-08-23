-- Assinatura recorrente de VIP via Asaas Checkout hospedado
-- (chargeTypes: ["RECURRENT"], ver lib/server/integrations/asaas.ts
-- createSubscriptionCheckout). Mesmo espírito de `store_orders` para
-- pedidos avulsos: o registro nasce no momento em que criamos o checkout
-- hospedado, e é atualizado pelo webhook conforme os eventos chegam.
--
-- `asaas_subscription_id` nasce NULL: a Asaas só cria a assinatura de fato
-- (e devolve seu ID) depois que o cliente paga a 1ª cobrança na página
-- hospedada — a resposta síncrona de POST /v3/checkouts só ecoa o payload
-- enviado. O vínculo inicial é feito por `asaas_checkout_id`
-- (`externalReference` = este `id`), exatamente como `store_orders` já usa
-- `asaas_checkout_id` para o mesmo propósito no fluxo de cartão avulso.
create table if not exists public.vip_subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users(id) on delete cascade,
  asaas_checkout_id     text not null unique,
  asaas_subscription_id text null unique,
  asaas_customer_id     text not null,
  status                text not null default 'pending'
    check (status in ('pending', 'active', 'past_due', 'canceled', 'expired')),
  current_period_end    timestamptz null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  canceled_at           timestamptz null
);

comment on column public.vip_subscriptions.status is
  'pending = checkout criado, aguardando 1º pagamento confirmar. active = pagamento em dia. past_due = cobrança do ciclo atrasada (Asaas ainda tenta cobrar; account_tier não é rebaixado aqui, só quando vip_expires_at vencer de fato via cron). canceled = usuário cancelou ou Asaas excluiu a assinatura (SUBSCRIPTION_DELETED); vip_expires_at não recua, acesso continua até o fim do período pago. expired = período encerrado sem renovação (redundante com account_tier=common, útil para histórico).';

create index if not exists idx_vip_subscriptions_checkout_id on public.vip_subscriptions(asaas_checkout_id);
create index if not exists idx_vip_subscriptions_asaas_id on public.vip_subscriptions(asaas_subscription_id);

alter table public.vip_subscriptions enable row level security;

drop policy if exists "Users can read their own subscription" on public.vip_subscriptions;
create policy "Users can read their own subscription"
  on public.vip_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

-- Toda escrita (criar, ativar, renovar, marcar atraso, cancelar) via
-- service_role dentro das RPCs desta migration/da seguinte — sem policy de
-- insert/update para authenticated, mesmo padrão de vip_expires_at em
-- user_profiles (nunca confiar no client pra decidir status de pagamento).

-- Idempotência de renovação: cada payment_id de cobrança confirmada só pode
-- processar uma vez, mesmo que o webhook reentregue o mesmo evento (comum
-- em qualquer gateway) — sem isso, reentrega somaria +1 mês duas vezes.
create table if not exists public.vip_subscription_payments (
  asaas_payment_id text primary key,
  subscription_id  uuid not null references public.vip_subscriptions(id) on delete cascade,
  processed_at     timestamptz not null default now()
);

create index if not exists idx_vip_subscription_payments_subscription
  on public.vip_subscription_payments(subscription_id);
