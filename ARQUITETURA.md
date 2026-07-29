# Arquitetura — Princípios do Projeto Sunano

> **Leia este documento antes de mexer em qualquer acesso a dados.**
> Ele descreve regras **obrigatórias**. Pull requests que as violem devem ser rejeitados.

Este projeto segue uma adaptação de **Clean Architecture** ao Next.js (App Router).
O objetivo número um é **segurança**: dados do banco nunca podem ser expostos nem
consultados a partir do navegador.

---

## 1. Regra de ouro

> **Nenhuma página ou componente (camada de front-end) consulta o banco de dados
> diretamente. Toda consulta vive na camada de domínio (`lib/server`).**

Concretamente, é **PROIBIDO**:

- ❌ Importar `@supabase/supabase-js` ou `@supabase/ssr` em qualquer arquivo de
  `app/**` (exceto Route Handlers) ou `components/**`.
- ❌ Usar `createClient` / `createBrowserClient` dentro de uma página/componente.
- ❌ Chamar `.from("tabela").select(...)` fora da camada de domínio.
- ❌ Importar qualquer coisa de `lib/server/**` em um arquivo `"use client"`.

É **OBRIGATÓRIO**:

- ✅ Server Components chamam **repositórios** (`lib/server/repositories/*`) diretamente.
- ✅ Client Components (`"use client"`) buscam dados via **endpoints `/api`** com `fetch`.
- ✅ Os endpoints `/api` delegam para os repositórios.
- ✅ O cliente Supabase do navegador (`lib/client/supabase-auth.ts`) é usado
  **somente para autenticação** (login OAuth, logout, observar a sessão).

---

## 2. Camadas

```
┌─────────────────────────────────────────────────────────────────────┐
│  FRONT-END  (app/**, components/**)                                  │
│  - Server Components: renderizam dados                               │
│  - Client Components ("use client"): interatividade                  │
│  - NUNCA acessam o banco diretamente                                 │
└───────────────┬─────────────────────────────┬───────────────────────┘
                │ import direto                │ fetch() HTTP
                │ (Server Components)          │ (Client Components)
                ▼                              ▼
        ┌───────────────┐            ┌──────────────────────┐
        │ lib/server/   │◀───────────│  app/api/**/route.ts  │
        │ repositories  │  import     │  (Route Handlers)     │
        └───────┬───────┘            └──────────────────────┘
                │
                ▼
        ┌───────────────────────────────────────────────────┐
        │  lib/server/  — CAMADA DE DOMÍNIO (server-only)    │
        │  supabase/ · repositories/ · auth/ · integrations/ │
        │  Único lugar que fala com o banco e com segredos.  │
        └───────────────────────────────────────────────────┘
```

### Por que Server Component chama o repositório direto (sem HTTP)?

Server Components **já rodam no servidor**. Fazer `fetch()` da própria API seria um
salto de rede inútil. A segurança é garantida de outra forma: a camada de domínio é
marcada com `import "server-only"`, então **é fisicamente impossível** que ela vá
parar no bundle do navegador — se alguém tentar importá-la num Client Component,
o build quebra.

Client Components não rodam no servidor, então **precisam** dos endpoints `/api`
como fronteira controlada.

---

## 3. Estrutura de pastas

```
lib/
  database.types.ts          Tipos do schema (sem código, seguro em qualquer lugar)
  stripe.ts                  Helpers puros (formatBRL) — seguro no cliente
  utils.ts, i18n.ts, ...     Utilitários puros e framework-agnósticos

  client/
    supabase-auth.ts         Cliente Supabase do NAVEGADOR — só autenticação

  server/                    ⬅ CAMADA DE DOMÍNIO — tudo aqui é `server-only`
    supabase/
      admin-client.ts        Cliente service-role (bypassa RLS) — segredo!
      server-client.ts       Cliente SSR ligado à sessão (cookies)
      route-client.ts        Cliente para Route Handlers (lê sessão)
      middleware-client.ts   Cliente para o middleware/proxy
    repositories/            ⬅ TODA consulta ao banco vive aqui
      home-repository.ts
      peripherals-repository.ts
      blog-repository.ts
      forum-repository.ts
      store-repository.ts
      offers-repository.ts
      users-repository.ts
    auth/
      admin-auth.ts          Autorização do painel admin
      current-user.ts        Resolve o usuário da requisição
    integrations/            Serviços externos (segredos ficam aqui)
      stripe.ts              Cliente Stripe (STRIPE_SECRET_KEY)
      youtube.ts
      telegram-offers.ts
    rate-limit.ts

components/
  providers/                 Contextos React (".tsx") — antes misturados em lib/
    cart-context.tsx, theme-context.tsx, ...

app/
  api/**/route.ts            Endpoints — "wrappers" HTTP sobre os repositórios
  **/page.tsx                Páginas (Server ou Client Components)
```

**Regra de arquivo:** `lib/` não mistura mais `.ts` e `.tsx`. Código React com JSX
(`.tsx`) mora em `components/`. `lib/` é só lógica.

---

## 4. Os clientes Supabase — qual usar

| Cliente | Arquivo | Onde usar | Observação |
|---|---|---|---|
| **Admin** | `lib/server/supabase/admin-client.ts` | Repositórios | service-role, bypassa RLS. **Segredo.** |
| **Server (SSR)** | `lib/server/supabase/server-client.ts` | Server Actions, auth | Ligado à sessão via cookies |
| **Route** | `lib/server/supabase/route-client.ts` | Route Handlers | Só para ler a sessão (`getUser`) |
| **Middleware** | `lib/server/supabase/middleware-client.ts` | `proxy.ts` | Refresh de sessão no middleware |
| **Auth (browser)** | `lib/client/supabase-auth.ts` | Client Components | **Só autenticação.** Nunca `.from()` |

---

## 5. Receitas

### Preciso mostrar dados numa página (Server Component)

1. Adicione/escolha um método no repositório apropriado em `lib/server/repositories/`.
2. Importe e chame no `page.tsx`:
   ```tsx
   import { listAllPeripherals } from "@/lib/server/repositories/peripherals-repository"

   export default async function Page() {
     const items = await listAllPeripherals()
     return <Lista items={items} />
   }
   ```
3. Se a página deve sempre refletir o banco, adicione `export const dynamic = "force-dynamic"`.

### Preciso de dados num Client Component (`"use client"`)

1. Garanta que existe um método no repositório.
2. Crie/escolha um endpoint em `app/api/.../route.ts` que delega ao repositório.
3. No componente, use `fetch`:
   ```tsx
   const res = await fetch("/api/blog")
   const { posts } = await res.json()
   ```
   **Nunca** importe um repositório nem o Supabase aqui.

### Preciso de uma mutação (criar/editar)

- Endpoint `/api` (`POST`/`PATCH`/`DELETE`) ou Server Action que:
  1. Autentica (`getRequestUser` / `getAuthorizedProfile`).
  2. Valida a entrada (Zod).
  3. Chama um método de escrita do repositório.

---

## 6. Endpoints `/api` (wrappers de leitura criados nesta arquitetura)

| Endpoint | Para quê |
|---|---|
| `GET /api/blog` · `GET /api/blog/[slug]` | Blog (consumido pelo cliente) |
| `GET /api/peripherals` | Busca/comparador de periféricos |
| `GET /api/store/products/[slug]` | Detalhe de produto Loja/Bazar |
| `GET /api/forum/posts` · `/posts/[slug]` | Fórum |
| `GET /api/forum/votes` | Votos do usuário atual |
| `GET /api/auth/me` | Sessão + perfis (substitui query a `admin_profiles`) |
| `GET /api/offers` | Ofertas + votos |

---

## 7. Autenticação — a única exceção no cliente

O cliente `lib/client/supabase-auth.ts` **pode** rodar no navegador, porque o fluxo
de autenticação (redirect do Google OAuth, `onAuthStateChange`, `signOut`) exige isso.
Mas ele é **estritamente para autenticação**:

- ✅ `supabaseAuth.auth.signInWithOAuth(...)`, `signOut()`, `onAuthStateChange(...)`
- ❌ `supabaseAuth.from("qualquer_tabela")` — **proibido**

Para saber quem é o usuário ou ler o perfil, use `GET /api/auth/me`.

---

## 8. Checklist de revisão (PR)

- [ ] Nenhum arquivo novo em `app/**` (fora de `route.ts`) ou `components/**` importa
      `@supabase/*`.
- [ ] Nenhum Client Component importa de `lib/server/**`.
- [ ] Consultas novas ao banco estão num repositório de `lib/server/repositories/`.
- [ ] Client Components buscam dados só via `fetch("/api/...")`.
- [ ] Módulos de `lib/server/**` começam com `import "server-only"`.
- [ ] `npx tsc --noEmit` passa.

---

## 9. Pendências conhecidas / convenção a seguir

- As rotas de **CRUD do admin** (`app/api/admin/**`) já rodam no servidor e usam o
  `admin-client` — portanto são seguras. Algumas ainda têm a query embutida no
  handler. **Convenção:** ao tocar numa dessas rotas, migre a query para o
  repositório correspondente (padrão já aplicado em `forum`, `peripherals`,
  `blog`, `store`, `offers`).
- Erros de lint **pré-existentes** (`@typescript-eslint/no-explicit-any` etc.) em
  partes não tocadas do código não foram corrigidos nesta refatoração — não
  introduza novos.
- **Ofertas (`/offers`) não usa a Bot API do Telegram.** O bot do canal
  `canal_sunano` não é de uso exclusivo do Sunano — outro serviço externo já
  registrou um webhook nele (confirmado em 2026-07-29), e a Bot API recusa
  `getUpdates` (polling) enquanto qualquer webhook estiver ativo nesse token.
  Por isso `lib/server/integrations/telegram-offers.ts` lê as ofertas fazendo
  parse da página pública do canal (`https://t.me/s/<canal>`, o mesmo mecanismo
  usado pelo widget oficial de embed do Telegram), sem precisar de bot/token
  nenhum — `TELEGRAM_BOT_TOKEN` não é mais usado em lugar algum do projeto.
  **Convenção:** não reintroduza `getUpdates`/`setWebhook`/`deleteWebhook` nesse
  arquivo, nem rotacione esse token, sem confirmar antes — pode quebrar a
  integração de terceiros que já usa esse bot. Se o parsing de HTML quebrar
  (Telegram mudar o markup do preview), conserte o parser em
  `telegram-offers.ts`; a alternativa mais robusta a médio prazo, se viável, é
  um bot dedicado do Sunano como admin do canal (Bot API oficial, sem scraping).
