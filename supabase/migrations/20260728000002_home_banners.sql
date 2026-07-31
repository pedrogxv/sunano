-- Banners rotativos do topo da Home.
--
-- Substituem o bloco fixo "Periféricos sem mistério" por um carrossel de até
-- 7 banners ativos, cada um com imagem e link de destino (interno ou externo).
--
-- Leitura pública: a Home lista os ativos via repositório (service-role), mas
-- as policies abaixo existem como defesa em profundidade, seguindo ARQUITETURA.md.

create table if not exists public.home_banners (
  id               uuid primary key default gen_random_uuid(),
  image_url        text not null,
  image_url_mobile text,
  link_url         text,
  alt_text         text,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  starts_at        timestamptz,
  ends_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Colunas acrescentadas depois da primeira versão desta migration. O
-- `create table if not exists` acima é no-op para quem já rodou a v1, então as
-- novas colunas precisam vir por ALTER — assim o arquivo é seguro de rodar de
-- novo, tanto num banco limpo quanto num que já tem a tabela.
alter table public.home_banners
  add column if not exists image_url_mobile text,
  add column if not exists starts_at        timestamptz,
  add column if not exists ends_at          timestamptz;

comment on table public.home_banners is
  'Banners do carrossel do topo da Home. No máximo 7 podem estar ativos ao mesmo tempo.';
comment on column public.home_banners.image_url is
  'Arte principal (desktop). Recomendado 1600x500 (16:5).';
comment on column public.home_banners.image_url_mobile is
  'Arte alternativa para telas estreitas (art direction). Nulo = usa image_url recortada.';
comment on column public.home_banners.link_url is
  'Destino do clique. Caminho interno começando com "/" ou URL absoluta http(s). Nulo = banner não clicável.';
comment on column public.home_banners.alt_text is
  'Texto alternativo da imagem (acessibilidade). Vazio = imagem tratada como decorativa.';
comment on column public.home_banners.sort_order is
  'Ordem de exibição no carrossel, crescente. Empates caem para created_at.';
comment on column public.home_banners.starts_at is
  'Início da janela de veiculação. Nulo = já vale. Só entra no ar se is_active também for true.';
comment on column public.home_banners.ends_at is
  'Fim da janela de veiculação (exclusivo). Nulo = sem data de expiração.';

-- Só aceita caminho interno ou URL absoluta http(s). Barra explícita contra
-- `javascript:`/`data:` caso alguém escreva direto no banco — a mesma regra é
-- aplicada na API (Zod) antes de chegar aqui.
alter table public.home_banners
  drop constraint if exists home_banners_link_url_check;
alter table public.home_banners
  add constraint home_banners_link_url_check
  check (
    link_url is null
    -- "/" (a própria Home) ou "/algo"; recusa "//" e "/\", que os navegadores
    -- tratam como protocol-relative e escapariam para outro domínio.
    or link_url ~ '^/($|[^/\\])'
    or link_url ~* '^https?://'
  );

-- Uma janela que termina antes de começar nunca veicularia: erro de digitação.
alter table public.home_banners
  drop constraint if exists home_banners_schedule_window_check;
alter table public.home_banners
  add constraint home_banners_schedule_window_check
  check (starts_at is null or ends_at is null or ends_at > starts_at);

create index if not exists home_banners_active_order_idx
  on public.home_banners (sort_order, created_at)
  where is_active = true;

-- ────────────────────────────────────────────
-- Limite de 7 banners ativos
-- ────────────────────────────────────────────
-- O limite vale sobre `is_active` (o botão que o admin controla), não sobre a
-- janela de datas — assim o resultado é previsível: o painel mostra "N/7" e
-- esse número não muda sozinho quando um agendamento vence.
--
-- A API já bloqueia o 8º banner com mensagem amigável; este trigger é a rede
-- de proteção contra corrida entre dois admins salvando ao mesmo tempo.
create or replace function public.enforce_home_banner_active_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
begin
  if new.is_active is not true then
    return new;
  end if;

  select count(*) into active_count
  from public.home_banners
  where is_active = true
    and id is distinct from new.id;

  if active_count >= 7 then
    raise exception 'home_banners_active_limit: limite de 7 banners ativos atingido';
  end if;

  return new;
end;
$$;

drop trigger if exists home_banners_active_limit on public.home_banners;
create trigger home_banners_active_limit
  before insert or update of is_active on public.home_banners
  for each row execute function public.enforce_home_banner_active_limit();

-- ────────────────────────────────────────────
-- updated_at automático
-- ────────────────────────────────────────────
create or replace function public.touch_home_banner_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists home_banners_touch_updated_at on public.home_banners;
create trigger home_banners_touch_updated_at
  before update on public.home_banners
  for each row execute function public.touch_home_banner_updated_at();

-- ────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────
alter table public.home_banners enable row level security;

-- Banner no ar é conteúdo público da home; não contém dado de usuário. A
-- policy repete a janela de veiculação para que um banner agendado não vaze
-- antes da hora caso alguém leia a tabela pelo SDK anônimo.
drop policy if exists "Active home banners are publicly readable" on public.home_banners;
create policy "Active home banners are publicly readable"
  on public.home_banners
  for select
  using (
    is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

-- Escrita só pelo painel (service-role bypassa RLS) ou por perfil administrativo.
drop policy if exists "Admins manage home banners" on public.home_banners;
create policy "Admins manage home banners"
  on public.home_banners
  for all
  using (exists (select 1 from public.admin_profiles ap where ap.id = auth.uid()))
  with check (exists (select 1 from public.admin_profiles ap where ap.id = auth.uid()));
