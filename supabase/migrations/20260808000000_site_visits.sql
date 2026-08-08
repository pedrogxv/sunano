-- Contagem de visitantes do site (dashboard admin: visitantes hoje, únicos,
-- recorrentes, no mês). Não usamos nenhum serviço de analytics de terceiros
-- (ver /privacidade) — o "visitante" é identificado só por um hash SHA-256
-- de IP + User-Agent + salt secreto do servidor, irreversível e sem cookie
-- novo. O salt é fixo (não gira por dia): é isso que permite comparar um
-- hash contra dias anteriores para saber se o visitante é recorrente.
--
-- Uma linha por (visitor_hash, visited_date): a rota /api/track-visit faz
-- upsert com ignoreDuplicates, então múltiplas páginas vistas no mesmo dia
-- pelo mesmo visitante não inflam a contagem — é isso que torna "visitantes
-- únicos hoje" e "recorrentes hoje" contagens de pessoas, não de pageviews.
create table if not exists public.site_visits (
  id            uuid primary key default gen_random_uuid(),
  visitor_hash  text not null,
  visited_date  date not null,
  created_at    timestamptz not null default now(),
  unique (visitor_hash, visited_date)
);

-- Cobre "quantos hashes distintos visitaram numa data" (contagem do dia) e
-- também a checagem de recorrência (existe alguma linha desse hash antes
-- de hoje?).
create index if not exists idx_site_visits_date
  on public.site_visits (visited_date);
create index if not exists idx_site_visits_hash
  on public.site_visits (visitor_hash, visited_date);

alter table public.site_visits enable row level security;

-- Sem policy de select/insert para anon/authenticated: só a service role
-- (usada em /api/track-visit e no repositório do dashboard) acessa esta
-- tabela — RLS fica ligado como rede de proteção, mas o acesso real é
-- 100% via service role, que ignora RLS.
