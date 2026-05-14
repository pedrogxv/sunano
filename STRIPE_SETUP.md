# Configuração da Stripe — Loja & Bazar

Este documento descreve como configurar a integração Stripe para a **Loja** e o **Bazar** do Sunano.

---

## 1. Criar conta Stripe

1. Acesse [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Crie uma conta **business** em nome do canal/empresa
3. Complete a verificação de identidade (necessária para receber pagamentos)
4. **Importante**: Para PIX funcionar, a conta Stripe deve ser registrada no Brasil ou você deve usar Stripe Connect com uma conta conectada brasileira.

---

## 2. Credenciais necessárias no `.env.local`

```env
# Chave secreta da API (não expor ao cliente)
STRIPE_SECRET_KEY=sk_live_...

# Segredo do webhook (gerado ao criar o endpoint no dashboard)
STRIPE_WEBHOOK_SECRET=whsec_...

# Chave pública (não usada diretamente hoje, mas boa prática ter)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Onde encontrar as chaves

| Variável | Localização no Dashboard |
|----------|--------------------------|
| `STRIPE_SECRET_KEY` | Dashboard → Developers → API keys → Secret key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Dashboard → Developers → API keys → Publishable key |
| `STRIPE_WEBHOOK_SECRET` | Dashboard → Developers → Webhooks → (após criar o endpoint) → Signing secret |

**Em desenvolvimento**, use as chaves de teste (`sk_test_...`, `pk_test_...`).  
**Em produção**, use as chaves live (`sk_live_...`, `pk_live_...`).

---

## 3. Configurar o Webhook

O webhook é essencial: é ele que confirma o pagamento, atualiza o pedido no banco e desconta o estoque.

### 3.1 Criar o endpoint

1. Acesse Dashboard → Developers → Webhooks
2. Clique em **"Add endpoint"**
3. URL do endpoint:
   - **Produção**: `https://seudominio.com.br/api/webhooks/stripe`
   - **Desenvolvimento**: use o Stripe CLI (veja abaixo)
4. Selecione os eventos a escutar:
   - ✅ `checkout.session.completed`
   - ✅ `checkout.session.expired`
   - ✅ `charge.refunded`
5. Clique em **"Add endpoint"**
6. Copie o **Signing secret** (`whsec_...`) e adicione ao `.env.local` como `STRIPE_WEBHOOK_SECRET`

### 3.2 Testar localmente com Stripe CLI

```bash
# Instalar Stripe CLI (macOS)
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Redirecionar webhooks para o servidor local
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

O CLI imprimirá um `whsec_...` temporário — use esse como `STRIPE_WEBHOOK_SECRET` durante desenvolvimento.

---

## 4. Configurar PIX (Brasil)

Para aceitar PIX, a conta Stripe precisa estar habilitada para pagamentos no Brasil:

1. Dashboard → Settings → Payment methods
2. Habilite **PIX** (pode precisar verificar sua conta primeiro)
3. Confirme que a moeda padrão está em **BRL**

O código já está configurado para aceitar `['card', 'pix']`. Quando PIX não estiver disponível (ex: conta não-brasileira em teste), o Stripe automaticamente mostrará apenas cartão.

---

## 5. Executar a migration do banco

Antes de usar a loja, execute o SQL em **Supabase → SQL Editor**:

```sql
-- Cole o conteúdo completo de: supabase/store.sql
```

Ou via Supabase CLI:
```bash
supabase db push
# ou manualmente:
psql -h <host> -U postgres -d postgres -f supabase/store.sql
```

---

## 6. Permissões admin

Adicione `store_read` e `store_write` ao perfil de admin que vai gerenciar a loja:

```sql
-- No Supabase SQL Editor
update public.admin_profiles
set permissions = permissions || '{"store_read": true, "store_write": true}'::jsonb
where id = '<uuid-do-admin>';
```

Ou via painel admin: Settings → Usuários → editar permissões.

---

## 7. Fluxo completo de pagamento

```
Usuário → Adiciona produto ao carrinho
        → Clica "Finalizar Compra"
        → POST /api/store/checkout
           - Valida estoque em tempo real
           - Cria Stripe Checkout Session (card + pix)
           - Cria pedido "pending" no banco
           - Retorna URL do checkout Stripe
        → Redireciona para página Stripe (hosted checkout)
        → Usuário paga (cartão ou PIX)
        → Stripe dispara webhook checkout.session.completed
           → POST /api/webhooks/stripe
           - Atualiza pedido para "paid"
           - Decrementa estoque no banco
        → Usuário é redirecionado para /checkout/success
```

---

## 8. Testar pagamentos

Use os [cartões de teste da Stripe](https://stripe.com/docs/testing#cards):

| Número | Resultado |
|--------|-----------|
| `4242 4242 4242 4242` | Pagamento aprovado |
| `4000 0000 0000 9995` | Pagamento recusado (fundos insuficientes) |
| `4000 0025 0000 3155` | Requer autenticação 3DS |

- Validade: qualquer data futura (ex: `12/30`)
- CVV: qualquer 3 dígitos (ex: `123`)

Para PIX em ambiente de teste, o Stripe simula o pagamento automaticamente após alguns segundos no checkout.

---

## 9. Estrutura dos arquivos criados

```
app/
├── loja/
│   ├── page.tsx                    # Listagem da loja (server component, ISR 60s)
│   └── [slug]/page.tsx             # Detalhe do produto
├── bazar/
│   ├── page.tsx                    # Listagem do bazar (server component, ISR 60s)
│   └── [slug]/page.tsx             # Detalhe do item de bazar
├── checkout/
│   ├── success/page.tsx            # Página de sucesso (limpa carrinho)
│   └── cancel/page.tsx             # Página de cancelamento
├── api/
│   ├── store/checkout/route.ts     # POST: cria Stripe Checkout Session
│   ├── webhooks/stripe/route.ts    # POST: recebe eventos da Stripe
│   └── admin/store/
│       ├── products/route.ts       # GET/POST: lista e cria produtos
│       ├── products/[id]/route.ts  # GET/PATCH/DELETE: produto individual
│       └── upload-image/route.ts  # POST: upload de imagem para Supabase
└── admin/store/
    ├── page.tsx                    # Listagem admin (loja + bazar)
    ├── form.tsx                    # Formulário de produto compartilhado
    ├── new/page.tsx                # Criar produto
    └── [id]/page.tsx               # Editar produto

components/store/
├── CartDrawer.tsx                  # Carrinho lateral + botão de carrinho
└── ProductCard.tsx                 # Card de produto (loja e bazar)

lib/
├── stripe.ts                       # Cliente Stripe + helpers (formatBRL, parseSlug)
└── cart-context.tsx                # Context + Provider do carrinho (localStorage)

supabase/
└── store.sql                       # Schema: store_products, store_orders, RLS
```

---

## 10. Variáveis de ambiente — resumo completo

```env
# Obrigatórias para a loja funcionar:
STRIPE_SECRET_KEY=sk_live_...         # ou sk_test_... em desenvolvimento
STRIPE_WEBHOOK_SECRET=whsec_...        # gerado ao criar o webhook endpoint
NEXT_PUBLIC_APP_URL=https://...        # URL base (ex: https://sunano.com.br)

# Já existentes no projeto (Supabase):
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...          # necessário para admin e webhook
```

---

## 11. Considerações de segurança

- **Nunca** exponha `STRIPE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` ao cliente
- O webhook valida a assinatura Stripe antes de processar qualquer evento
- Stock é decrementado apenas **após** confirmação de pagamento via webhook
- Todas as rotas admin verificam autenticação + permissão `store_write`
- RLS no Supabase: produtos ativos são públicos; pedidos e escrita requerem service role
