# Mercado Pago — cartão de crédito da Loja

O PIX e o cartão têm gateways independentes, escolhidos por env:

| Env | Valores | O que decide |
|---|---|---|
| `STORE_PIX_GATEWAY` | `asaas` \| `stripe` | quem emite o PIX |
| `STORE_CARD_GATEWAY` | `asaas` \| `stripe` \| `mercadopago` | quem cobra o cartão |
| `STORE_PAYMENT_METHODS` | `pix` ou `pix,credit_card` | se o cartão aparece |

Sem `STORE_PIX_GATEWAY`/`STORE_CARD_GATEWAY`, vale o `PAYMENT_GATEWAY` antigo (e,
sem ele, a Asaas). Trocar de gateway é trocar uma linha; pedidos já criados
seguem no gateway em que nasceram. Regra em `lib/server/payments/gateway.ts`.

**Enquanto `STORE_PAYMENT_METHODS=pix`, o cartão não aparece em lugar nenhum**,
mesmo com o Mercado Pago configurado. É a trava da fase de testes.

## Como funciona

Checkout Transparente pela **Orders API** (`/v1/orders`). A Payments API
(`/v1/payments`) não recebe mais funcionalidade nova; a Orders é a indicada
para integração nova.

1. Em `/checkout`, "Continuar para o cartão" só abre o **Card Payment Brick**
   na própria tela. Nenhum pedido existe ainda. O Brick desenha os campos
   (iframes do Mercado Pago) e gera um token de uso único. O número do cartão
   nunca passa pelo nosso servidor.
2. No "Pagar", `POST /api/store/checkout` (com `card`) reserva o estoque, grava
   o pedido (`payment_gateway = 'mercadopago'`, valor do cartão fixado no
   servidor) e, na mesma requisição, cria a order do Mercado Pago com o token
   (processada e capturada na hora), com o valor do PEDIDO, nunca o que veio
   do navegador. Limite de tentativas por IP e por conta.
3. `processed` → o pedido vira pago na mesma resposta. `failed` (ou 4xx do
   Mercado Pago) → o pedido é **apagado** e o estoque volta. Ninguém foi
   avisado dele, e o cliente tenta outro cartão no mesmo formulário. A Orders
   API não tem `binary_mode`: se a order ficar em análise (`processing`) ou a
   resposta não chegar (timeout/5xx), o pedido fica pendente e o webhook
   decide. Uma nova tentativa nesse pedido vai por `/checkout/card`
   (`POST /api/store/orders/[id]/card-payment`, com teto também por pedido).
5. `/api/webhooks/mercadopago` (tópico `order`) é a rede de segurança: decisão
   de order em análise, aprovação perdida, contestação, estorno feito no
   painel. Sempre relê a order na API.

O id da order (`ORD…`) fica em `store_orders.mercadopago_payment_id` (nome
herdado da primeira versão, pela Payments API; a coluna é texto).

Casos de borda já tratados: aprovação depois de o pedido expirar ou ser
cancelado, pagamento duplicado e valor divergente → **devolução automática**
e aviso no Discord.

**Credencial × ambiente.** Na Orders API sandbox e produção usam a mesma
família de credencial (`APP_USR-`); `TEST-` é recusada pela própria API. Antes
de cobrar, o servidor confere na API que a conta é de **usuário de teste** em
`sandbox` e **real** em `production` (`assertAccountMatchesEnvironment`). Sem
isso, uma credencial real com `MERCADOPAGO_ENV=sandbox` cobraria cartões de
verdade em pedidos marcados como teste.

## Aplicações no Mercado Pago

| | Conta real | Usuário de teste vendedor |
|---|---|---|
| Uso | produção | sandbox |
| Aplicação | Sunano Loja, App ID `3900191615102670` | criada no painel do vendedor de teste (Checkout Transparente → **API de Orders**) |
| Webhook | `https://sunano.com.br/api/webhooks/mercadopago`, tópico **order** | o mesmo, cadastrado na aplicação do vendedor de teste |

Usuários de teste (criados em 2026-10-18; senhas no painel da conta real, em
*Suas integrações → Contas de teste*):

| Perfil | Usuário | ID |
|---|---|---|
| Vendedor | `TESTUSER732718140448551333` | 3770562951 |
| Comprador | `TESTUSER2536566283621978300` | 3774264836 |

A "Sunano Loja" também assina `payment`, `topic_chargebacks_wh` e
`topic_claims_integration_wh`, de antes da migração: a rota responde 200 e
ignora. Dá para desmarcar no painel. Ela foi criada como *Checkout Bricks*;
se as credenciais de produção dela recusarem `/v1/orders`, crie outra na conta
real como Checkout Transparente → API de Orders.

## Ativar em teste (sandbox)

1. Entre no painel com o **usuário de teste vendedor** (janela anônima; se
   pedir código, são os 6 últimos dígitos do ID) e crie a aplicação:
   Checkout Transparente → **API de Orders**.
2. Copie as **credenciais de produção** dela:
   ```
   STORE_CARD_GATEWAY=mercadopago
   MERCADOPAGO_ENV=sandbox
   MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
   NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY=APP_USR-...
   ```
3. Webhook: na mesma aplicação, *Webhooks → Configurar notificações*, URL
   `https://sunano.com.br/api/webhooks/mercadopago`, evento **Order (Mercado
   Pago)**. Copie a assinatura secreta para `MERCADOPAGO_WEBHOOK_SECRET`.
   (Localhost não recebe webhook; a resposta síncrona já libera o pedido.)
4. Para testar a tela, ligue o cartão SÓ no ambiente de teste:
   `STORE_PAYMENT_METHODS=pix,credit_card`.
5. Cartão de teste Mastercard `5480 8328 0103 3311`, CVV `123`, validade
   `11/30`, CPF `12345678909`. O **nome do titular** decide o resultado:
   `APRO` aprova, `OTHE` recusa, `FUND` saldo insuficiente etc.
   ([lista](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/cards)).
   O e-mail do pagador vai trocado por `test@testuser.com` em sandbox (é o
   único que a Orders API aceita lá).

PIX e cartão precisam estar no mesmo ambiente. Mercado Pago em `sandbox` com o
PIX em produção (ou o contrário) desliga o cartão sozinho, com o motivo no log.

## Ir para produção

1. **Parcelamento sem juros**: a vitrine anuncia "em até Nx sem juros" (N =
   máximo de parcelas no admin da Loja). No painel do Mercado Pago, em *Seu
   negócio → Custos → Parcelamento sem juros*, ative até o mesmo N. Sem isso,
   o comprador paga juros nas parcelas e a vitrine estaria errada.
2. Troque para as **credenciais de produção da conta real** (`APP_USR-...`) e
   `MERCADOPAGO_ENV=production`. `sandbox` é recusado em `VERCEL_ENV=production`,
   e credencial de usuário de teste é recusada em `production`.
3. `MERCADOPAGO_WEBHOOK_SECRET` com a assinatura secreta da aplicação da conta
   real (é outra, de outra aplicação).
4. Resolva as pendências da conta real no Mercado Pago (endereço e e-mail
   confirmado) e faça uma compra real de valor baixo antes de abrir.
5. Só então: `STORE_PAYMENT_METHODS=pix,credit_card`.

## Envs

| Env | Onde |
|---|---|
| `MERCADOPAGO_ENV` | `sandbox` \| `production` |
| `MERCADOPAGO_ACCESS_TOKEN` | servidor (secreto) |
| `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` | navegador (monta o Brick) |
| `MERCADOPAGO_WEBHOOK_SECRET` | servidor (valida `x-signature`) |
