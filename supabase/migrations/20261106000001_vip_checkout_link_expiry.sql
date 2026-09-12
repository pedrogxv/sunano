-- Checkout de assinatura em aberto: link para retomar e prazo para destravar.
--
-- O PROBLEMA QUE ISTO RESOLVE
-- ---------------------------
-- No fluxo de CARTÃO a linha de `vip_subscriptions` nasce `pending` com
-- apenas `asaas_checkout_id` — o `asaas_subscription_id` só existe depois do
-- 1º pagamento (CHECKOUT_PAID). Enquanto está nesse estado, o usuário fica
-- sem saída nenhuma:
--
--   • `POST /api/vip/subscribe` recusa com 409 (trava de assinatura em
--     andamento, via getOngoingSubscriptionForUser);
--   • `POST /api/vip/cancel` devolve 404 — sem `asaas_subscription_id` não
--     há assinatura para cancelar na Asaas;
--   • `syncSubscriptionWithAsaas` desiste de propósito: não há id para
--     consultar, e `GET /v3/checkouts/{id}` não existe na API v3.
--
-- A aba "Assinatura" então mostrava só um texto informativo, sem ação: "Há um
-- checkout em aberto… ele expira sozinho". Na prática, até 1 hora
-- (`minutesToExpire: 60`) sem poder pagar nem desistir. E se o webhook
-- CHECKOUT_EXPIRED se perdesse — o cenário que toda a reconciliação deste
-- módulo existe para cobrir — a linha ficava presa em `pending` PARA SEMPRE,
-- e nem esperar resolvia.
--
-- A CORREÇÃO
-- ----------
-- Duas colunas, preenchidas na criação do checkout (POST /api/vip/subscribe):
--
--   • `checkout_link`       — a URL hospedada da Asaas, hoje descartada. É o
--     que permite RETOMAR o pagamento em vez de só esperar o prazo acabar.
--   • `checkout_expires_at` — quando o checkout deixa de valer. É o que
--     permite a trava se soltar SOZINHA, sem depender do webhook: uma linha
--     `pending` vencida não bloqueia mais uma nova tentativa de assinatura.
--
-- Nenhuma das duas é fonte de verdade sobre pagamento: quem confirma
-- continua sendo o webhook (CHECKOUT_PAID), com a reconsulta do payment real
-- que ele já faz. `checkout_expires_at` só governa a TRAVA local, e errar
-- para o lado de destravar é seguro — a trava existe para evitar cobrança
-- duplicada, e um checkout vencido não cobra nada.

alter table public.vip_subscriptions
  add column if not exists checkout_link text null;

comment on column public.vip_subscriptions.checkout_link is
  'URL do Asaas Checkout hospedado enquanto o pagamento não é concluído — permite ao usuário retomar de onde parou. SOMENTE no fluxo de cartão (no PIX não há checkout hospedado). Não é segredo: é a mesma URL para a qual o usuário foi redirecionado ao assinar, e a página exige os dados do cartão de qualquer forma.';

alter table public.vip_subscriptions
  add column if not exists checkout_expires_at timestamptz null;

comment on column public.vip_subscriptions.checkout_expires_at is
  'Quando o Asaas Checkout em aberto expira (criação + minutesToExpire). Governa a trava local de "assinatura em andamento": passada essa data, a linha pending deixa de bloquear uma nova assinatura mesmo que o webhook CHECKOUT_EXPIRED nunca tenha chegado. Não decide nada sobre pagamento — isso é sempre do webhook.';

-- Índice parcial: a varredura por checkout vencido só interessa em linhas
-- `pending` com data preenchida, que é uma fração mínima da tabela.
create index if not exists vip_subscriptions_pending_checkout_expiry_idx
  on public.vip_subscriptions (checkout_expires_at)
  where status = 'pending' and checkout_expires_at is not null;
