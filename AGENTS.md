<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Migrations do Supabase — padrão obrigatório

O CLI do Supabase usa o **prefixo do nome do arquivo** como *version*. Dois arquivos
`supabase/migrations/` com o mesmo prefixo colidem na mesma versão e quebram
`supabase db push` (o segundo arquivo fica pra sempre marcado como não-aplicado).

Regras ao criar uma migration nova:

1. **Nome:** `YYYYMMDDHHMMSS_descricao.sql`. Se já existir outro arquivo com o
   mesmo prefixo de data no dia, **sempre** sufixe com horário (`HHMMSS` ou um
   contador `000001`, `000002`, …). Nunca deixe dois `YYYYMMDD_*.sql` sem sufixo
   coexistindo — nem em commits diferentes.
2. **Idempotência:** antes de `create policy` / `create trigger`, sempre
   `drop policy if exists` / `drop trigger if exists` (Postgres não tem
   `create or replace` nem `if not exists` pra esses). Use `if not exists` /
   `add column if not exists` no resto.
3. **Nunca rode migration ad-hoc colando SQL no Dashboard.** Foi assim que o
   histórico desalinhou 2×. Se o `db push` estiver bloqueado, conserte o
   bloqueio, não contorne.

## Consertar drift de histórico (migrations aplicadas mas não registradas)

Sintoma: `supabase migration list --linked` mostra linhas com `remote` vazio para
migrations que **já rodaram** no banco (schema já existe lá).

1. Confirme por conteúdo que já foram aplicadas — consulte objetos reais no
   remoto: `npx supabase db query --linked -f check.sql` (procure tabelas,
   colunas, `pg_proc`, constraints que a migration cria).
2. `npx supabase migration repair --status applied <version> [<version> …]` —
   **só escreve em `supabase_migrations.schema_migrations`, não executa SQL.**
3. Para colisão de prefixo: `git mv` o arquivo em conflito para um timestamp
   livre e faça `repair --status applied` do novo prefixo.
4. Valide: `npx supabase db push --dry-run` deve dizer `Remote database is up to date`.

# Banco: cliente só lê conteúdo público

Todo dado de negócio passa por rota do Next com `service_role`. A chave anon e a
sessão do usuário não escrevem em tabela nenhuma e só leem as tabelas de
conteúdo público listadas em `supabase/tests/security_invariants.sql`.

- Tabela nova em `public` nasce sem grant para `anon`/`authenticated` (default
  revogado em `20261113000000`). Não crie grant nem policy de
  INSERT/UPDATE/DELETE para eles. Se a tabela é conteúdo público: `grant select`,
  policy de SELECT e a tabela na allowlist do script, no mesmo commit.
- Leitura "do próprio usuário" também é pela rota. Policy `auth.uid() = user_id`
  deixa um token sem o segundo fator (aal1) ler o dado direto na REST.
- Função `SECURITY DEFINER` nova: `set search_path` e
  `revoke execute ... from public` (revogar só de `anon, authenticated` não tira
  o grant que veio de PUBLIC).
- Storage: upload e assinatura de URL sempre pelo admin client dentro da rota.
  `storage.objects` não tem policy de cliente.
- Depois de qualquer migration:
  `npx supabase db query --linked -f supabase/tests/security_invariants.sql`
  tem que voltar sem nenhuma linha.

# Símbolo da Aura — SEMPRE o componente central

**Toda** referência nova à Aura (saldo, custo, preço, contador, ranking,
badge, pílula, botão) desenha a chama com `components/ui/AuraIcon.tsx`.

```tsx
import { AuraIcon, AuraAmount, AuraIconHolder } from "@/components/ui/AuraIcon"

<AuraIcon />                       // chama sozinha, laranja da Aura
<AuraIcon size="sm" tone="inherit" />  // dentro de algo que já tem cor
<AuraAmount value={item.auraCost} />   // chama + número (todo PREÇO usa este)
<AuraIconHolder><AuraIcon glow /></AuraIconHolder>  // com halo pulsando
```

**NUNCA** escreva `<Flame>` à mão nem `🔥` como moeda. Se você está prestes a
digitar `<Flame className="size-3 text-orange-400" fill="currentColor">`, ou a
colar `🔥 {custo}` — **pare**: isso já existe no componente. Foi exatamente
assim que a mesma chama apareceu em CINCO cores diferentes: `text-primary`
(que é **branco puro** no tema — a chama saía sem cor nenhuma),
`text-orange-500`, `text-orange-400`, `text-amber-400` e sem cor, cada tela
com o seu `fill`/`strokeWidth`, e metade dos preços com emoji e a outra metade
com SVG.

Regras:

- **Tamanho é token, não número.** `size="sm"`, nunca `size-[13px]`. Para um
  tamanho fora da escala, passe `className` — nunca um `<Flame>` novo.
- **Cor é `tone`, não classe.** `brand` (padrão) é o laranja da moeda;
  `inherit` é para quando o container já define a cor (pílula colorida, botão,
  linha de ranking); `muted` para rótulo secundário. Precisa da cor SOLTA
  (config de ícone genérico, como `EstatisticasGrid`)? Use
  `AURA_BRAND_COLOR_CLASS` / `AURA_BRAND_BG_CLASS`, nunca o literal.
- **`primary` NÃO é a cor da Aura.** `--primary` é branco no tema; quem usou
  `text-primary` achando que era "a cor de destaque" fez a chama sumir.
- **Preço é `AuraAmount`, não ícone + número montados na mão.** Era assim que
  uma tela mostrava o SVG e a de ao lado o emoji, com espaçamento diferente.
- **`glow` é exceção, não padrão.** O pulso existe para o ícone que a tela
  quer que puxe o olho; se tudo pulsa, nada pulsa. O halo exige o wrapper
  `AuraIconHolder` (é o `::before` dele que desenha).
- **Emoji só quando é ARTE, não moeda.** O 🧊 do card de Proteção de Ofensiva
  é desenho do item (prop `icon` do `AuraPriceTag`); a moeda por trás continua
  sendo Aura.
- **Ícone como VALOR numa config usa `AuraFlameIcon`.** Telas que guardam
  `icon: Flame` numa tabela (rankings de `/pessoas`, trilhas de conquista,
  tipos de notificação, emblema de moldura, botão de reação) não conseguem
  chamar `<AuraIcon>` direto. Elas importam `AuraFlameIcon`, que tem a
  assinatura de `React.ElementType`. Se o mapa estiver tipado como
  `typeof Bell`/`LucideIcon`, **alargue para `React.ElementType`** — amarrar o
  mapa ao tipo da lib é o que prendia a moeda ao ícone do lucide.
- **A forma mora em `aura-flame-shape.tsx`**, e `AuraIcon` (chapada) e
  `AuraFlame` (animada) leem de lá. Nunca redesenhe a silhueta numa das duas:
  quando a chama nova nasceu só dentro do `AuraFlame`, o site passou a ter
  DOIS símbolos — a Central com o desenho novo e ~28 telas (topbar e home
  entre elas) com o antigo.
- **Fogo que NÃO é Aura continua sendo `Flame` do lucide.** A aba "Em Alta"
  do fórum, "Pré-venda" da loja e o ícone genérico de site no `smart-link`
  usam a chama no sentido de "popular/quente". Trocá-los pelo símbolo da
  moeda faria a tela prometer Aura onde não há.

# Foto de usuário — SEMPRE o componente central

**Toda** referência nova a foto de perfil, avatar ou mini perfil usa
`components/ui/ProfileAvatar.tsx`. Sem exceção, em qualquer tela — fórum,
comentários, rankings, loja, admin, byline de notícia, tierlist.

```tsx
import { ProfileAvatar } from "@/components/ui/ProfileAvatar"

<ProfileAvatar
  name={profile.display_name}
  avatarUrl={profile.avatar_url}
  size="md"                       // xs | sm | md | lg | xl | 2xl
  tier={profile.account_tier}
  vipExpiresAt={profile.vip_expires_at}
  frameUrl={profile.equipped_avatar_frame_url}
/>
```

**NUNCA** escreva um avatar à mão. Se você está prestes a digitar
`rounded-full` junto de `<Image>`/`<img>`/`ImageWithFallback` com um
`avatar_url`, ou a montar iniciais de fallback, ou um `ring-`/`border-` de VIP,
ou uma coroa/medalha em cima de uma foto — **pare**: isso já existe no
componente. Foi exatamente assim que o site acumulou ~40 avatares divergentes,
cada tela com a sua borda, e o VIP com anel numa página e nada na outra.

Regras:

- **Tamanho é token, não número.** `size="sm"`, nunca `size-[33px]`. A
  espessura do anel, o tamanho do emblema e o `sizes` da imagem derivam do
  token; um tamanho solto obriga a reacertar os três e é o que gerava a
  divergência. Para um tamanho fora da escala, use `wrapperClassName`
  (ex: `wrapperClassName="size-[72px]"`), nunca um avatar novo.
- **Nunca a coluna crua.** `avatarUrl` deve vir de `profileMediaProxyUrl(...)`
  (`lib/account-tier.ts`); a coluna direta do Storage ignora a trava de GIF
  animado por tier.
- **Componentes finos, não cópias.** `PersonAvatar` (faísca da tag especial) e
  `UserAvatar` (compatibilidade com `size` numérico do admin) são cascas sobre
  `ProfileAvatar`. Precisa de um enfeite específico da sua tela? Envolva o
  componente, não reimplemente a foto. Em código novo prefira `ProfileAvatar`
  direto.
- **Forma é um prop, não um componente novo.** `shape="circle"` (padrão) ou
  `shape="rounded"` (a foto grande do perfil). `AvatarQuadrado` é só uma casca
  que passa `shape="rounded"` e o lightbox. **Nunca** desenhe o anel com
  `border-image`: ele **ignora `border-radius` por especificação**, e o
  gradiente sai como um retângulo de canto vivo por cima da foto arredondada —
  foi exatamente esse o bug de "moldura fora da borda da imagem" no perfil. O
  anel é um elemento ATRÁS da foto, com o raio casando com o do recorte
  (`SHAPE_RADIUS` em `ProfileAvatar`).
- **Um sinal de VIP por avatar.** A coroa/selo sai da moldura (`badge` em
  `profile-frames.ts`). Não adicione outra coroa ao lado do nome nem um
  `ring`/glow roxo no card: isso dobra o sinal, e o segundo nunca segue a
  precedência (um VIP com moldura de rank equipada aparecia com as duas).
  Exceção: o **badge de tier** (pílula "VIP"/"Membro" com rótulo) é outro
  elemento e pode coexistir.

## Molduras

A regra de qual moldura alguém exibe mora **só** em `lib/profile-frames.ts`
(módulo puro). Nenhum componente decide isso sozinho. Precedência:
**equipada > Fundador > VIP**. Sem moldura equipada, sem Fundador e sem VIP, o
avatar não tem moldura nenhuma.

- **A moldura viaja como UM objeto: `profileFrameOf(...)` → `frame`.** Toda
  casca (`ProfileAvatar`, `PersonAvatar`, `AuthorLink`, `UserAvatar`,
  `AvatarQuadrado`) aceita `frame`; use-o em vez de `tier`/`vipExpiresAt`/
  `frameUrl`/`frameSlug`/`isFounder` soltos. Enquanto era prop opcional solta,
  fórum, comentários, rankings, pódio, notícias e tierlist simplesmente não
  passavam nada — quem comprava moldura só a via no próprio perfil, e cada
  tela nova repetia o esquecimento porque o TypeScript não reclamava.
- **A moldura entra no ENRIQUECIMENTO, não na tela.** Quem monta autor/perfil
  já a traz: `buildProfileMap` (`profile-enrichment.ts`, usado por fórum,
  notícias, reviews e comentários), `toProfileSummary`/`DIRECTORY_COLUMNS`
  (diretório, pódio, rankings), `getAuthorProfiles` (byline de notícia) e
  `getProfileFramesByUser` (para o que vem de RPC, como o card da comunidade).
  Use `authorFrameFields(...)` para os campos `author_*` e `authorFrom(...)`
  para montar a identidade do autor — nunca `author={{ ... }}` inline.
- **Posse em lote, sempre.** `getVipFounderOwners(ids)` recebe a página
  inteira; uma consulta por avatar é N+1 em cima da listagem do fórum.
- **Nunca redigite o tipo da linha na tela.** Telas de admin que declaravam um
  `type XRow = { ... }` próprio, copiado do repositório, perdiam silenciosamente
  cada campo novo — a moldura entre eles — porque o compilador não compara uma
  cópia com o original. Importe o tipo do repositório
  (`import type { AdminReferralItem } from ".../referrals-repository"`), mesmo
  em Client Component: `import type` é apagado no build e não puxa
  `server-only` para o bundle.
- **Campo de moldura em mapper é OBRIGATÓRIO, nunca opcional com default.**
  `buildRow` (`vip-admin-repository`) exige `frame` como parâmetro, igual a
  `isFounder` em `ProfileSummaryExtras`: é o que força cada listagem nova a
  buscar `getProfileFramesByUser(ids)` em lote. Como campo opcional, a tela
  compila sem a moldura e o Fundador volta a sair com a coroa de VIP comum.
- **Avatar sem moldura só onde não é identidade.** Typeahead de menção, chip
  empilhado de "resgatado por" e a própria foto na caixa de comentar podem
  ficar sem `frame` (16–20px, a moldura não se lê). Em QUALQUER avatar que
  represente uma pessoa numa lista, card, cabeçalho ou fila de moderação, a
  moldura é obrigatória.
- **Conceder ≠ equipar.** A moldura só aparece no site quando está EQUIPADA
  (é o slot que todas as telas leem). O backfill `20261119000000` equipou a de
  Fundador para quem não tinha escolhido nada — e só para slot VAZIO
  (`equipped_avatar_frame_id is null`), porque sobrescrever a escolha do dono
  contraria a própria precedência ("a equipada ganha de tudo").
- **Quem responde "o que eu tenho?" é `getFrameCollection`**
  (`lib/server/repositories/frame-collection-repository.ts`), e a tela de
  escolher é `ProfileFramePicker`, no editor de perfil (`/perfil`) — ao lado
  da foto e do banner, que é onde a pessoa vai mexer na própria aparência.
  A Central de Aura continua sendo a LOJA (comprar, e a vitrine do que
  existe); ela não é mais o único lugar de equipar.
  - **Nunca refaça a consulta de posse na tela.** A posse mora em
    `user_aura_items`, mas as molduras concedidas são `active = false` e NÃO
    vêm em `listActiveAuraItems()` — foi por esse filtro que a Central
    precisou de `getVipFounderItemId()` + `getStreakFrameItemIds()` à parte.
    Toda tela nova lê a coleção pronta (ou `GET /api/aura/frames`, para
    página client), senão recompõe as três consultas e erra de um jeito novo.
  - **Ofereça TODAS as possuídas, não só a "melhor".** Quem tem 50 dias possui
    os quatro marcos de verdade (o trigger concede todos os alcançados) e pode
    preferir exibir o anel discreto de 1 dia. A Central mostrava botão só para
    o marco mais alto, e as outras três molduras da pessoa viravam enfeite.
  - **Moldura nenhuma é caso especial: a de VIP também é posse.** Até a
    migration `20261125000000` a de VIP era exibida só por PRECEDÊNCIA
    (`resolveProfileFrame` olha `isVip`) e ninguém tinha a linha em
    `user_aura_items` — então ela era a única moldura que, depois de equipar
    outra, a pessoa NÃO conseguia escolher de volta: o fallback só roda com o
    slot vazio, e nada podia ocupar o slot com ela. Hoje a assinatura concede
    a posse (trigger em `user_profiles`, os mesmos seis caminhos do Fundador)
    e auto-equipa **só em slot vazio e sem opt-out** — sobrescrever a escolha
    do dono contraria a própria precedência. Ao criar moldura nova, o caminho
    é sempre este: linha em `aura_items` + posse em `user_aura_items`, nunca
    um ramo à parte em `resolveProfileFrame`.
  - **Posse permanente, exibição que expira.** A linha de `vip` NÃO é apagada
    quando a assinatura vence: `isFrameEntitled` confere `isVip` antes de
    desenhar, então o ex-assinante para de exibir o anel e volta a exibi-lo
    sozinho se re-assinar, sem backfill de limpeza. É a mesma trava que
    impede uma posse concedida por engano de virar o privilégio. Na coleção,
    esse caso é o parâmetro `expired` de `push` (`frame-collection-repository`)
    — o único lugar onde posse NÃO basta para equipar; Fundador é permanente
    e marco de ofensiva sai do recorde, que não anda para trás.
  - **"Nenhuma" é uma ESCOLHA, não slot vazio.** `equipped_avatar_frame_id
    is null` significa "nunca escolhi" e cai no fallback de honraria
    (Fundador > VIP). Quem clica em "Nenhuma" grava
    `user_profiles.avatar_frame_opt_out` (migration `20261122000000`), que
    `resolveProfileFrame` respeita ANTES do fallback — sem isso um Fundador
    tirava a moldura, a rota respondia ok e o avatar continuava emoldurado no
    site inteiro. Equipar qualquer moldura desliga a flag (trigger
    `trg_clear_frame_opt_out` + `equipAvatarFrame`), senão a escolha nova não
    apareceria. O campo é OBRIGATÓRIO em `ProfileFrameIdentity`, pelo mesmo
    motivo de `isFounder`: como opcional, cada enriquecimento novo o
    esqueceria e a honraria voltaria a aparecer em quem pediu para não a ter.
  - **Equipar valida o KIND, não só a posse.** `equipAvatarFrame` confere
    `kind = 'avatar_frame'` igual a `equipMiniProfileBg`: sem isso, um POST
    com o id de um Fundo de Mini Perfil possuído gravava esse item no slot da
    moldura — a posse existe, então a checagem antiga passava.
- **Equipada vale para moldura sem asset.** `resolveProfileFrame` casa o
  `slug` contra `CODE_ART_FRAMES` ANTES de olhar a URL. Uma moldura de anel
  (Fundador, VIP) não tem PNG: resolver pela URL primeiro fazia a equipada
  cair no ramo do VIP e o item sumir da tela depois de equipado. Ao criar
  moldura de arte em código, registre-a nesse mapa — senão ela não desenha.
- **Fundador é posse, e é permanente.** `vip:founder` é concedida a quem tem
  VIP ativo dentro da janela (`VIP_FOUNDER_DEADLINE`, 01/10/2026) e **fica
  mesmo depois de a assinatura acabar** — por isso `isFounder` NÃO se deriva
  de `account_tier`/`vip_expires_at`, tem de vir do banco
  (`lib/server/repositories/vip-founder-repository.ts`, sempre em LOTE:
  listagem de fórum/ranking desenha dezenas de avatares).
- **Quem concede é o banco, não a rota.** O trigger de `user_profiles`
  (migration `20261118000000`) cobre os SEIS caminhos que dão VIP (cartão,
  PIX, renovação, reativação, compra com Aura, concessão do admin). Não
  adicione a concessão numa RPC: o caminho que ficar de fora só aparece como
  "assinei e não ganhei" depois da janela fechada.
- **A data-limite existe nos dois lados e precisa bater** — `VIP_FOUNDER_DEADLINE`
  (TS, decide o que a tela mostra) e `vip_founder_deadline()` (SQL, decide
  quem de fato recebe). A do banco é a que vale; mudar uma sem a outra faz a
  loja prometer o que o banco recusa. Benefício com prazo entra em
  `vipSubscriptionBenefits()` (função, não constante), para sumir sozinho das
  telas de assinatura quando a janela fecha.

- **Arte no código, posse no banco** — mesmo modelo de
  `lib/mini-profile-backgrounds.ts`. `aura_items`/`user_aura_items`/
  `user_profiles.equipped_avatar_frame_id` guardam identidade, posse e slot;
  o desenho vive em `profile-frames.ts`, amarrado pelo `slug`. Item sem arte =
  avatar sem moldura (degradação suave), nunca tela quebrada.
- **Molduras são itens equipáveis, não `if` no código.** `aura_items.acquisition`
  (`purchase` | `vip` | `rank` | `grant`, migration `20261116000000`) diz como
  cada uma é obtida; `redeem_aura_item` recusa tudo que não é `purchase`. Ao
  adicionar uma moldura nova, crie a linha E a arte — nunca um `if` numa tela.
- **Ofensiva concede por MARCO, não por pódio.** As molduras `streak:1`,
  `streak:10`, `streak:25` e `streak:50` (migration `20261120000000`) são
  concedidas por um trigger em `user_streaks` ao ATINGIR o marco, e a posse é
  permanente: o direito sai de **`longest_streak`**, nunca de
  `current_streak`. Amarrar à ofensiva viva faria a moldura sumir do avatar no
  primeiro dia perdido — e um marco alcançado não se desfaz.
  **Conceder é só dar o direito de EQUIPAR: ofensiva não entra no fallback de
  precedência.** O fallback é só da honraria de assinatura (Fundador > VIP);
  `resolveProfileFrame` devolve `null` para quem não tem nenhuma das duas e
  não equipou nada. Como o marco mais baixo é 1 dia, pôr ofensiva no fallback
  emoldurava qualquer membro que completou as missões um único dia, sem ele
  ter escolhido nada — e com a pílula "Sem ofensiva" ao lado, porque o direito
  sai do recorde e a sequência viva era 0. Pódio de Ofensiva
  segue fora (`rank:streak:*` inertes): o placar é raso, o 2º e o 3º têm zero
  dia. Paleta turquesa→ciano + pássaro, a mesma da badge de ofensiva no
  símbolo mas NÃO na cor (a da badge é a rampa quente, que é de Aura).
  O recorde viaja junto da moldura (`longestStreak` em `ProfileFrameIdentity`,
  `longest_streak` nos enriquecimentos, `author_longest_streak` nos `author_*`)
  e é OBRIGATÓRIO em `ProfileSummaryExtras`, pelo mesmo motivo de `isFounder`.
- **Ranking concede POSSE, nunca exibição.** Entrar no top 3 de um placar
  all-time dá a moldura para sempre; **sair do pódio não a tira**. Ela só
  aparece no avatar se a pessoa EQUIPAR — `resolveProfileFrame` continua sem
  receber colocação, e `isFrameEntitled` valida pela linha em
  `user_aura_items`, nunca pela posição de agora. Conferir a posição ali
  desfaria a regra: quem caiu para 4º perderia sozinho a moldura que escolheu
  exibir. No pódio e nas listas o lugar continua sendo dito pelo pedestal,
  pelo número e pela coroa do 1º.
  - **Quem concede é um CRON, não um trigger** (`/api/cron/rank-frames`, de
    hora em hora → `syncRankFrames` → RPC `grant_rank_frame`). Ranking não tem
    evento onde pendurar trigger: ninguém "atinge" o 1º lugar, a pessoa É 1º
    enquanto ninguém a ultrapassa, e a colocação muda por atividade de
    TERCEIROS. Não há linha para observar.
  - **A RPC devolve o `item_id` só na primeira vez** (`on conflict do
    nothing` + `row_count`), e `null` depois. É o que separa "entrou no pódio"
    (notifica) de "continua no pódio" (silêncio) — sem isso o cron avisaria a
    mesma pessoa de hora em hora.
  - **Os placares têm de ser os mesmos de `/pessoas`**, exclusões inclusive
    (dono do site e banidos fora, os demais sobem uma posição). Senão alguém
    recebe "1º em Aura" sem estar em 1º na tela.
  - **Nunca escreva "em breve" numa moldura de ranking.** Elas são concedidas:
    o que falta é a colocação do usuário, não o lançamento da feature. O lock
    é `rank` ("Top 3 do ranking"), não `unavailable`.
  - **`rank:streak:*` segue inerte** e fora de `FRAME_RANK_BOARDS`: o placar
    de ofensiva é raso (2º e 3º com zero dia), a moldura iria para quem não
    fez nada.
- **Cada ranking precisa de cor E símbolo próprios.** Aura é fogo + rampa
  quente (vermelho→laranja→amarelo). Não repita nenhum dos dois em outro
  ranking: Ofensiva já saiu idêntica a Aura uma vez justamente assim, e
  ninguém conseguia dizer de qual placar a moldura era.
