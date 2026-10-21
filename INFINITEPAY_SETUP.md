# InfinitePay — cartão de crédito da Loja

`STORE_CARD_GATEWAY=infinitepay` põe o cartão na InfinitePay. O PIX continua
no gateway de `STORE_PIX_GATEWAY`, e trocar de gateway é trocar essa linha.
Pedidos já criados seguem no gateway em que nasceram. Regra em
`lib/server/payments/gateway.ts`.

## Como funciona

Checkout integrado (link de pagamento hospedado), com a API pública
`api.checkout.infinitepay.io`.

1. Em `/checkout`, "Pagar com cartão" faz `POST /api/store/checkout`. O
   servidor reserva o estoque, grava o pedido (`payment_gateway = 'infinitepay'`,
   valor do cartão fixado no servidor) e **só depois** cria o link (`/links`)
   com `order_nsu` = id do pedido. Se o link falhar, o pedido é apagado e o
   estoque volta. Nunca existe link pagável sem pedido.
2. O cliente paga na página da InfinitePay, que oferece cartão até 12x e
   também PIX, e volta para `/checkout/card?orderId=…&transaction_nsu=…&slug=…`.
3. A tela chama `POST /api/store/orders/[id]/infinitepay-return`, e
   `applyInfinitePayPayment` consulta `payment_check` na InfinitePay. Só com
   `paid: true` e valor ≥ total do pedido o pedido vira pago.
4. `/api/webhooks/infinitepay?token=…` é a rede de segurança: mesmo
   `payment_check`, mesma função idempotente.

**Nada é liberado pelo que chega de fora.** A API não tem chave e o webhook não
tem assinatura. O token na URL do webhook só barra chamadas de terceiros. Quem
libera é a consulta servidor a servidor.

**Sem estorno por API:**
- Admin → Estornar: estorne no app da InfinitePay, marque "Já estornei" e
  confirme. Só então o pedido grava o estorno.
- Pagamento que não pode quitar o pedido (valor menor, pedido cancelado,
  duplicidade) **não volta sozinho**. Ele fica em
  `metadata.infinitepay_unapplied` e aparece em vermelho no admin e no Discord,
  para estorno manual.

**Pedido não pago expira** igual ao PIX: `PIX_EXPIRATION_MINUTES` (60 min;
24 h com pré-venda), pelo cron `expire-pending-orders` a cada 15 min, que
devolve o estoque. O link da InfinitePay **não** expira junto (a API não tem
validade nem cancelamento), então quem paga depois ainda quita o pedido
expirado: o estoque é retomado (`reReserveStockForLatePayment`) e, se o item
esgotou nesse meio tempo, o pedido sai como `oversold` para repor ou estornar.

**Pago por PIX na página da InfinitePay:** o pedido segue como "cartão" e o
Discord avisa. O valor é o do cartão (o cliente escolheu cartão no nosso site).

## Configurar

1. **Ative o checkout externo** no app/painel da InfinitePay:
   <https://app.infinitepay.io/external-checkout#configuracoes?enabled=true>.
   Sem isso a API responde `external_checkout_not_enabled`.
2. **Parcelamento:** a página da InfinitePay oferece até 12x. A loja assume
   a taxa até 6x (`assured_installments: 6`, enviado em cada link por
   `createInfinitePayCheckoutLink`), que é o que a sobretaxa de 10% cobre.
   De 7x a 12x os juros são repassados ao cliente. A vitrine anuncia "em até
   Nx" com o máximo do admin da Loja: deixe em 6.
3. **Envs (Vercel, Production):**
   ```
   STORE_CARD_GATEWAY=infinitepay
   INFINITEPAY_HANDLE=<InfiniteTag sem o $>
   INFINITEPAY_WEBHOOK_TOKEN=<openssl rand -hex 32>
   ```
   Sem `INFINITEPAY_HANDLE` ou `INFINITEPAY_WEBHOOK_TOKEN`, o cartão fica
   desligado (motivo no log).
4. **Ambiente:** a InfinitePay não tem sandbox. Num deploy, o cartão só liga
   se o PIX também estiver em produção (`ASAAS_ENV`/`STRIPE_ENV=production`).
   Exceção: no `next dev` local (fora da Vercel) ela se declara sandbox, então
   o cartão liga com o PIX em sandbox e o pedido é gravado com
   `is_sandbox = true`. A cobrança continua REAL: valor baixo e estorno no app.
   O retorno e o webhook vão para `NEXT_PUBLIC_APP_URL` (o túnel ngrok). Com
   o túnel fora do ar, o checkout recusa o cartão (o log diz o motivo), porque
   o pagamento seria cobrado e nunca chegaria ao pedido: `payment_check` não
   encontra a venda sem o `transaction_nsu`.
5. **Migration** `20261231000000_store_orders_infinitepay_gateway.sql`
   (`npx supabase db push`).

## Testar (em produção, valor baixo)

1. Produto barato, compra no cartão. O redirecionamento tem de abrir
   `*.infinitepay.com.br` (ou `.io`). Se a API devolver outro host, a criação do link falha
   de propósito (ver `createInfinitePayCheckoutLink`).
2. Pague e clique "Continuar". O pedido deve virar pago na volta, sem esperar
   o webhook.
3. Logs da Vercel: o webhook deve chegar com 200 (`result: "already"`, porque o
   retorno já aplicou).
4. Estorne no app da InfinitePay e registre no admin com "Já estornei".
5. Feche a página da InfinitePay sem pagar e abra o pedido em Meus Pedidos: o
   botão "Ir para o pagamento" deve reabrir o link.
