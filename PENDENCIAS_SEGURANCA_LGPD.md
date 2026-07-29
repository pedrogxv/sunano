# Pendências de Segurança e LGPD

Backlog gerado a partir da auditoria de segurança + LGPD de 2026-07-29. Cobre tudo que **não** foi
corrigido naquela rodada — porque envolve decisão de produto/negócio/jurídica, dado que faltava
(CNPJ, razão social), ou é um trabalho de manutenção grande demais para misturar com o resto.

Cada item tem: o que está pendente, por que não foi resolvido direto, e o que fazer quando for
priorizado. Itens técnicos sem decisão pendente (rate limit, erros crus, etc.) **não** estão aqui —
já foram corrigidos no código.

---

## 1. Identificação do controlador na política de privacidade

**Onde**: `app/privacidade/page.tsx`, seção 1 ("Identificação do Controlador").

**Status atual**: só diz "O Sunano é o controlador dos dados pessoais" + um e-mail. Sem razão
social, CNPJ ou endereço físico.

**Por que não foi resolvido**: precisa de dado real que eu não tenho — não posso inventar CNPJ ou
endereço.

**O que fazer**: me passar (ou editar direto):
- Razão social / nome da pessoa jurídica (ou física, se for MEI/pessoa física) responsável pelo Sunano
- CNPJ (ou CPF, se pessoa física)
- Endereço (pode ser o endereço fiscal/comercial)

Depois é uma edição de texto simples na seção 1.

---

## 2. Coleta de CPF e endereço sem uso real (LGPD Art. 6º, III — minimização)

**Onde**: `app/register/actions.ts:79-91` (campos `full_name, cpf, phone, postal_code, street,
number, complement, neighborhood, city, state`), schema em `PurchaseProfileInput`.

**Status atual**: nesta rodada só ajustamos o *texto* da política/PrivacidadeTab para não prometer
uma correção que não existe (ver `app/privacidade/page.tsx` seção 7, `PrivacidadeTab.tsx`). A causa
raiz continua: esses campos são coletados no cadastro mas **nenhum fluxo do produto os lê** — nem o
checkout (`app/api/store/checkout/route.ts`), nem o webhook do Stripe. A UI que os colheria
(`showPurchase` em `components/auth/UserRegisterForm.tsx:55`) está declarada mas nunca ativada —
é código morto hoje.

**Por que não foi resolvido**: é decisão de produto (você escolheu "só ajustar o texto" quando
perguntei). Continua em aberto.

**Opções para quando for decidir**:
- **Remover a coleta** (recomendado se não há plano de usar em breve): tira os campos do cadastro
  e da tabela `user_profiles`/schema, remove `showPurchase` e o código morto associado. Reintroduzir
  quando houver uso real (ex.: entrega física de produtos da loja/bazar).
- **Implementar de verdade**: conectar `showPurchase` no formulário de cadastro (ou mover para o
  checkout, que faz mais sentido — só pedir CPF/endereço quando a pessoa for de fato comprar algo
  que exige envio), e adicionar edição desses campos em `/perfil` (fecha também o direito de
  retificação do item 7 do relatório original).

---

## 3. Verificação de idade / consentimento parental (LGPD Art. 14)

**Onde**: `app/termos/page.tsx` (texto já suavizado — agora é autodeclaração, não promessa de
verificação/bloqueio).

**Status atual**: não existe campo de data de nascimento nem qualquer gate técnico no cadastro
(`app/register/actions.ts`, `UserRegisterForm.tsx`). O texto dos Termos já não promete mais algo que
não existe, mas a plataforma continua sem qualquer mecanismo real de verificação de idade.

**Por que não foi resolvido**: você escolheu suavizar o texto por agora em vez de construir o
fluxo completo (era a opção recomendada, dado o escopo).

**O que fazer quando for priorizado**: adicionar campo de data de nascimento no cadastro, bloqueio
para menores de 13, e uma tela/checkbox de consentimento do responsável para 13–18. É uma feature
nova, não um bugfix — vale dimensionar como tal.

---

## 4. Retenção de IP em texto puro no `audit_log`

**Onde**: `lib/server/repositories/users-repository.ts:554,583` — grava `ip_address` sem hash para
`consent_recorded` e `account_deleted`, retido por até 2 anos.

**Status atual**: mitigado por RLS (`supabase/migrations/20260613_lgpd_compliance.sql` — só
`service_role` lê/escreve essa tabela), mas ainda é dado pessoal bruto retido por 2 anos, diferente
do padrão de hash já usado em `lib/server/rate-limit.ts`.

**Por que não foi resolvido**: é uma troca consciente entre privacidade (hashear) e capacidade de
investigação de abuso/fraude (IP em texto puro é útil se você precisar rastrear um ataque ou
responder a uma ordem judicial). Hashear com o mesmo salt do rate-limit tornaria o IP irreversível
mesmo para vocês — não é uma decisão puramente técnica.

**O que fazer quando for priorizado**: decidir se o `audit_log` precisa do IP legível (ex.: para
investigação de fraude/abuso) ou se pode ser hasheado como o rate-limit. Se optar por hash, é uma
mudança pequena (reusar `getClientIdentifierFromHeaders` ou função equivalente).

---

## 5. Consentimento tudo-ou-nada e mistura de bases legais

**Onde**: `components/auth/UserRegisterForm.tsx:146-178`, `LgpdConsentForm.tsx:43-62`,
`app/privacidade/page.tsx` (tabela de bases legais, linha ~116-119).

**Status atual**: um único checkbox aceita Política de Privacidade + Termos de Uso ao mesmo tempo. A
tabela de bases legais lista CPF/endereço com **duas** bases legais simultâneas ("Consentimento" e
"Execução de contrato") para o mesmo dado, o que é juridicamente frágil (a LGPD pede uma base legal
por finalidade, não uma mistura "para garantir").

**Por que não foi resolvido**: não há hoje nenhuma finalidade que precise de consentimento
*separado* de política/termos (ex.: não existe newsletter/marketing opt-in), então o formulário
tudo-ou-nada não é errado por si só — mas a tabela de bases legais está tecnicamente inconsistente,
e isso é mais uma revisão jurídica do que uma correção de código.

**O que fazer quando for priorizado**: revisar com quem cuida da parte jurídica qual base legal
única cabe para CPF/endereço (provavelmente só "execução de contrato" quando o dado realmente for
necessário para entrega — ver item 2), e ajustar a tabela da política. Se no futuro surgir algo
como newsletter, aí sim vale um checkbox separado.

---

## 6. Bump geral de dependências (npm audit)

**Onde**: `package.json` (o campo `overrides` que força `sharp`/`postcss` para versões seguras
dentro do `next` já está lá, pendente de commit — ver abaixo).

**Status atual**: as 3 vulnerabilidades altas reais (postcss e sharp, aninhados dentro do próprio
`next`) precisam de um `npm install` que **inevitavelmente** também atualiza React (19.2.5→19.2.8),
Supabase JS (2.103→2.111), Next (16.2.11→16.2.12), Zod (4.3.6→4.4.3), Tailwind, Framer Motion e
outras libs diretas para suas versões mais recentes dentro do range `^`. Numa tentativa isso quebrou
o typecheck do Stripe (a versão mais nova do SDK exige uma string de `apiVersion` diferente da
fixada em `lib/server/integrations/stripe.ts:19`).

**Risco real hoje**: baixo. As vulnerabilidades do `postcss` (XSS/path traversal via source map) só
importam se CSS não confiável passar por ele — não é o caso aqui (só CSS do próprio projeto). As do
`sharp`/libvips só importam se a otimização de imagem do Next rodar localmente processando bytes de
imagem enviados por usuário — na Vercel, isso pode ser feito pela infraestrutura gerenciada de
Image Optimization em vez do `sharp` local, o que reduziria ainda mais a exposição (não confirmei
isso com certeza, é uma característica da plataforma).

**O que fazer quando for priorizado**: tratar como uma tarefa de manutenção dedicada, não uma
correção pontual:
1. Rodar `npm install` (aplica o `overrides` já presente em `package.json`).
2. Atualizar `lib/server/integrations/stripe.ts:19` para a nova `apiVersion` exigida pelo SDK — mas
   **validar antes** se essa versão da API do Stripe muda o formato de algum evento de webhook que
   o projeto já trata (`app/api/webhooks/stripe/route.ts`).
3. Rodar `npm run typecheck`, `npm run build`, e testar manualmente: login, cadastro, fórum, upload
   de imagem, checkout completo (Stripe em modo teste) e o painel admin.
4. Só então commitar `package.json` + `package-lock.json` juntos.

---

## Resumo — o que cada item precisa de você

| # | Item | Preciso de você |
|---|------|------------------|
| 1 | Identificação do controlador | Razão social, CNPJ, endereço |
| 2 | CPF/endereço sem uso | Decisão: remover coleta ou implementar de verdade |
| 3 | Verificação de idade | Decisão: construir o fluxo ou manter só a autodeclaração |
| 4 | IP em texto puro no audit_log | Decisão: hashear ou manter legível para investigação |
| 5 | Bases legais misturadas | Revisão jurídica da tabela de bases legais |
| 6 | Bump de dependências | Janela de tempo para testar build/checkout/webhooks antes de commitar |
