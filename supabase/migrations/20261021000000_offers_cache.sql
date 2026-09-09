-- Cache persistente das ofertas do Telegram.
--
-- Até aqui `/offers` era 100% efêmero: cada request fazia scraping de
-- `t.me/s/canal_sunano` e mostrava as ~30 últimas mensagens (o teto de
-- `getTelegramOffers`). Nada era guardado — daí a sensação de "some oferta":
-- não sumia nada, é que nunca existiu histórico. O canal publica ~30
-- mensagens/dia, então 30 mensagens ≈ um único dia de ofertas.
--
-- Esta tabela guarda o que o scraping vê, com retenção de 5 dias. Dois ganhos
-- além do histórico:
--   1. Se o Telegram mudar o markup do preview (o risco conhecido do scraping,
--      ver ARQUITETURA.md §9), a página continua servindo os últimos 5 dias
--      enquanto o parser é consertado, em vez de ficar vazia na hora.
--   2. O texto fica pesquisável no banco, não só no que coube na última página.
--
-- NÃO é fonte de verdade: o Telegram é. Um upsert sempre sobrescreve o texto
-- e a imagem, porque mensagem editada no canal deve refletir aqui.
--
-- Volume esperado: ~30 linhas/dia × 5 dias ≈ 150 linhas, texto de ~123 chars
-- em média (medido no canal em 2026-09-09). Menos de 200 KB com índices.

create table if not exists public.offers_cache (
  -- Mesmo id usado por `offers_votes.offer_id` ("telegram-<messageId>"), pra
  -- não precisar de tradução entre as duas tabelas. Sem FK entre elas de
  -- propósito: um voto pode sobreviver à expiração da oferta.
  id            text primary key,
  message_id    bigint not null unique,
  text          text   not null,
  -- Data da mensagem no Telegram (não a de ingestão) — é ela que decide o
  -- "novo"/"antigo" na UI e a expiração.
  posted_at     timestamptz not null,
  author        text,
  author_avatar jsonb,
  chat_title    text,
  url           text,
  -- { url, width, height } — mesmo shape de TelegramOfferImage.
  image         jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

comment on table public.offers_cache is
  'Cache das ofertas raspadas de t.me/s/<canal>, retenção de 5 dias. Fonte de verdade é o Telegram; ver lib/server/integrations/telegram-offers.ts.';
comment on column public.offers_cache.posted_at is
  'Data da mensagem no Telegram. Base do aviso de "oferta antiga" (48h) e da expiração (5 dias) — nunca usar first_seen_at pra isso.';

-- A consulta padrão é "últimos 5 dias, mais recente primeiro".
create index if not exists idx_offers_cache_posted_at
  on public.offers_cache(posted_at desc);

-- ────────────────────────────────────────────
-- RLS: leitura pública, escrita só pelo service role
-- ────────────────────────────────────────────
-- A página /offers é pública e anônima (nenhum login pra ler), e todo o
-- conteúdo aqui já é público por natureza — vem de um canal aberto do
-- Telegram que qualquer um lê sem conta. Não há coluna sensível nesta tabela:
-- não guarda nada do visitante, só o que o canal publicou.
alter table public.offers_cache enable row level security;

drop policy if exists "Offers cache is publicly readable" on public.offers_cache;
create policy "Offers cache is publicly readable"
  on public.offers_cache for select
  using (true);

-- Nenhuma policy de insert/update/delete: a escrita acontece só pelo
-- admin-client (service role), que ignora RLS. O visitante não escreve aqui.

-- ────────────────────────────────────────────
-- Expiração
-- ────────────────────────────────────────────
-- Chamada pelo próprio caminho de leitura (sem cron), logo depois do upsert.
-- security definer porque roda no service role e não deve depender de RLS.
create or replace function public.prune_offers_cache(retention_days int default 5)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.offers_cache
  where posted_at < now() - (retention_days || ' days')::interval;
$$;

comment on function public.prune_offers_cache is
  'Remove ofertas com mais de N dias (padrão 5). Chamada após o upsert em getTelegramOffers.';
