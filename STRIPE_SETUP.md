# Stripe: gateway alternativo da Loja

A Asaas é o gateway padrão. O Stripe só cobra quando `PAYMENT_GATEWAY=stripe`, e
existe para a Loja não ficar sem vender se a conta da Asaas ficar indisponível.

- **Hoje: só PIX.** O cartão está pronto no código, mas desligado
  (`storeCardPaymentsEnabled()` em `lib/server/payments/gateway.ts`). Ver a seção
  "Religar o cartão" antes de ligar.
- **Pedido já criado segue no gateway em que nasceu.** Trocar `PAYMENT_GATEWAY`
  com pedidos em aberto não quebra webhook, cancelamento nem estorno deles.
- **A assinatura VIP continua sempre na Asaas.**

Código: `lib/server/integrations/stripe.ts` (cliente), `app/api/webhooks/stripe/route.ts`
(webhook), `lib/server/repositories/stripe-orders-repository.ts` (o que cada evento
faz no pedido).

---

## 1. Variáveis de ambiente

| Variável | Valor |
|---|---|
| `PAYMENT_GATEWAY` | `stripe` liga o Stripe. Qualquer outro valor (ou ausente) mantém a Asaas. |
| `STORE_PAYMENT_METHODS` | Formas da Loja: `pix`, `credit_card` (vírgula). Ausente = as duas; PIX sempre ligado. No Stripe o cartão fica desligado mesmo listado. |
| `STRIPE_ENV` | **Obrigatória.** `sandbox` ou `production`. |
| `STRIPE_SECRET_KEY` | Chave secreta ou restrita (`sk_`/`rk_`). |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Chave publicável (`pk_`), do **mesmo modo** da secreta. Só o formulário de cartão usa. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret do endpoint (`whsec_`). |

Coerência que o código **exige** (erro alto, nunca cobrança errada em silêncio):

- `STRIPE_ENV=sandbox` só com chave `*_test_`; `STRIPE_ENV=production` só com `*_live_`.
- A chave publicável tem de ser do mesmo modo da secreta.
- `STRIPE_ENV=sandbox` é recusado quando `VERCEL_ENV=production`.

Em desenvolvimento use as chaves de teste. As chaves ficam no Dashboard em
Desenvolvedores > Chaves de API.

### Permissões da chave restrita (`rk_`)

Prefira uma chave restrita só com o que o código usa:

| Recurso | Permissão | Para quê |
|---|---|---|
| PaymentIntents | Write | criar, confirmar, capturar, cancelar, reler |
| ConfirmationTokens | Read | confirmar o cartão com o token do navegador |
| Charges | Read | risco do Radar, 3DS, comprovante |
| Refunds | Write | estornar (inclui a listagem) |
| Disputes | **Read** | reler a disputa. Sem ela o webhook de disputa responde 500 para sempre |
| Radar Early Fraud Warnings | Read | aviso de fraude |

---

## 2. Webhook

Dashboard > Desenvolvedores > Webhooks > Adicionar endpoint:

- **URL de produção:** `https://sunano.com.br/api/webhooks/stripe`
- **Eventos:** exatamente a lista `STRIPE_WEBHOOK_EVENTS` em
  `lib/server/integrations/stripe.ts` (hoje 16 eventos: `payment_intent.*`,
  `charge.refunded`, `charge.refund.updated`, `refund.*`,
  `radar.early_fraud_warning.created`, `review.*`, `charge.dispute.*`).
  Evento tratado no código e não assinado aqui **nunca dispara**.
- Copie o Signing secret (`whsec_`) para `STRIPE_WEBHOOK_SECRET`.

Desenvolvimento local:

```bash
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe   # imprime um whsec_ temporário
```

### Como o webhook se protege

- A assinatura é conferida sobre o **corpo cru**, antes de qualquer outra coisa.
- Evento de outro modo (`livemode`) é ignorado, nunca mexe em pedido.
- **Nada é liberado, capturado ou devolvido pelo corpo do evento.** O PaymentIntent
  é relido na origem (`getStripePayment`) e só então valor e moeda são conferidos.
- Toda transição é condicional (`status in (...)`): reentrega e eventos fora de
  ordem não duplicam efeito.
- Resposta `500` faz o Stripe reentregar (com backoff, por até 3 dias).
- Aura, medalhas e aviso aos admins nascem de **trigger** em `store_orders`, no
  mesmo `UPDATE` do pagamento.

### Quando o pedido não vira pago

A tela do PIX também confere o pagamento na origem (no máximo uma vez a cada 5 s por
pedido), como rede de segurança do webhook. Se mesmo assim ficar em "Aguardando":

1. Dashboard > Webhooks > o endpoint > **Entregas**. Há tentativa para
   `payment_intent.succeeded`? Qual resposta?
2. `400` = assinatura inválida (o `whsec_` do endpoint não é o da env).
   `500 Webhook não configurado` = env ausente ou incoerente (ver seção 1).
3. Faltando só os eventos de disputa: conferir a permissão Disputes (read).

---

## 3. PIX

1. Dashboard > Configurações > Métodos de pagamento: habilite **PIX** (a conta
   precisa ser brasileira e estar verificada).
2. Moeda BRL.

O QR vale o mesmo prazo que a Loja impõe (`PIX_EXPIRATION_MINUTES`, padrão 60 min;
pré-venda 24 h; o Stripe aceita de 10 s a 14 dias). Ao vencer, o cron
`/api/cron/expire-pending-orders` (a cada 15 min) expira o pedido, **devolve o
estoque primeiro** e só depois cancela o PaymentIntent no Stripe.

---

## 4. Religar o cartão

Está desligado de propósito. Antes de trocar `storeCardPaymentsEnabled()`:

- [ ] **Radar:** crie regras de velocidade (várias tentativas por IP, cartão ou
      e-mail em pouco tempo) e de 3D Secure. Quando o banco pede 3DS o
      `client_secret` vai ao navegador e quem o tem consegue tentar outro cartão
      direto no Stripe, fora da contagem da nossa rota. O Radar é o contrapeso.
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` configurada (do mesmo modo da secreta).
- [ ] Testar com os cartões de teste do Stripe (aprovado, recusado, 3DS) em sandbox.
- [ ] Conferir o fluxo de **revisão**: cartão acima de R$ 1.500,00 sem 3DS, ou com
      risco elevado, fica autorizado e **não capturado** até um admin aprovar
      (`approve_card_review`) ou cancelar. A autorização vence em ~7 dias.

Como funciona: o número do cartão nunca chega ao nosso servidor (Payment Element, PCI
SAQ A). O navegador gera um `ctoken_` e a **nossa rota** confirma o pagamento, com
tetos de tentativa por pedido (6), por conta (10) e por IP (20). A captura é manual:
o webhook decide capturar, segurar ou soltar.

---

## 5. Banco de dados

**Nunca cole SQL no Dashboard.** Migration só por `supabase db push` (ver AGENTS.md).

- `20261225000000_store_orders_stripe_gateway.sql`: índices de busca do webhook.
- `20261226000000_store_orders_stripe_hardening.sql`: PaymentIntent único por
  pedido, remoção de índices redundantes e a função `merge_store_order_metadata`.

Depois de qualquer migration:

```bash
npx supabase db query --linked -f supabase/tests/security_invariants.sql   # tem que voltar vazio
```

`store_orders` não tem grant nem policy para `anon`/`authenticated`: tudo passa por
rota com `service_role`.

### Por que `metadata` é gravado por merge atômico

Comprovante, revisão de cartão, aviso de fraude, disputa e contador de estorno
mexem no mesmo `store_orders.metadata` e podem chegar juntos. Ler o objeto,
espalhar e gravar tudo perdia a chave de quem chegou segundo. Use sempre
`patchOrderMetadata` (`lib/server/repositories/order-metadata-repository.ts`).

---

## 6. Idempotência (cuidado)

O Stripe guarda o resultado da primeira chamada com uma `idempotencyKey`, **erro
inclusive**, e o devolve por 24 horas.

- **Criação** (`store-pix-<pedido>`, `store-card-pi-<pedido>`): o id do pedido é novo
  a cada tentativa, então uma falha nunca é repetida.
- **Estorno:** a chave leva o total já estornado **e um contador de falhas**
  (`metadata.refund_attempt`). Clique duplo continua colapsando; depois de uma falha
  (saldo insuficiente, por exemplo) a nova tentativa usa chave nova.
- **Captura:** sem chave. Capturar duas vezes não cobra duas vezes (a segunda recusa
  por estado), e uma falha passageira não pode ficar repetida nas reentregas.

---

## 7. Ir para produção

1. Chaves **live**, `STRIPE_ENV=production`, publicável `pk_live_`.
2. Endpoint de webhook **live** com os 16 eventos e o `whsec_` live.
3. `PAYMENT_GATEWAY=stripe` e novo deploy.
4. Pague um PIX real de valor baixo, confira o pedido virar pago, a Aura creditada
   e a **entrega do webhook** no Dashboard.
5. Estorne esse pedido pelo admin e confira o pedido virar `refunded`.

Pedidos de sandbox ficam fora das telas do cliente e da fila padrão do admin
(`is_sandbox`).

---

## 8. Mais

- Disputa: o aviso no Discord traz o prazo (`due_by`). Sem resposta até lá a loja
  perde por padrão; disputa perdida é reconciliada como estorno.
- Aviso de fraude do emissor: pedido pendente é solto e expira; pago e **não
  enviado** é estornado sozinho (fica registrado em `store_admin_audit_log` como
  `order.refund_automatic`); já enviado só avisa.
- Documentação oficial: https://docs.stripe.com/payments/pix e
  https://docs.stripe.com/webhooks
