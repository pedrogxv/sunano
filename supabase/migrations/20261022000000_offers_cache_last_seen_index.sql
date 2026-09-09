-- Índice para `getLastSyncedAt()`.
--
-- O cron de ofertas (/api/cron/sync-telegram-offers) começa perguntando
-- "quando foi a última sincronização?" via `max(last_seen_at)` — se uma visita
-- à página já atualizou há menos de 5 min, ele pula a busca no Telegram. Essa
-- pergunta roda a cada disparo do cron, então precisa ser um index scan e não
-- um seq scan sobre a tabela inteira.
--
-- Ordem desc porque a consulta é sempre `order by last_seen_at desc limit 1`.
create index if not exists idx_offers_cache_last_seen_at
  on public.offers_cache(last_seen_at desc);
