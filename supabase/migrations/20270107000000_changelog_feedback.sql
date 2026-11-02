-- Voto (útil / não útil) e reações nas Patch Notes (/changelog).
--
-- As entradas do changelog vivem no código (lib/i18n-*.ts), não no banco: a
-- linha guarda só a CHAVE da versão (`changelogFeedbackKeys`,
-- lib/changelog-feedback.ts), validada pela rota contra a lista atual.
--
-- Tudo passa pela rota com service_role (AGENTS.md, "cliente só lê conteúdo
-- público"): sem grant e sem policy para anon/authenticated. As contagens
-- saem agregadas por `changelog_feedback_totals`, nunca linha a linha, então
-- quem votou em quê não sai do servidor.

-- ---------------------------------------------------------------------------
-- 1. Voto: um por pessoa por versão. A PK faz o upsert trocar ↑ por ↓ numa
--    instrução só, sem janela em que a pessoa conte nos dois lados.
-- ---------------------------------------------------------------------------
create table if not exists public.changelog_votes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  entry_key  text not null check (entry_key ~ '^[a-z0-9-]{1,64}$'),
  value      smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_key)
);

alter table public.changelog_votes enable row level security;
revoke all on table public.changelog_votes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Reações: várias por pessoa por versão, uma de cada tipo.
-- ---------------------------------------------------------------------------
create table if not exists public.changelog_reactions (
  user_id    uuid not null references auth.users(id) on delete cascade,
  entry_key  text not null check (entry_key ~ '^[a-z0-9-]{1,64}$'),
  reaction   text not null check (reaction in ('party', 'heart', 'rocket', 'mindblown', 'eyes', 'confused')),
  created_at timestamptz not null default now(),
  primary key (user_id, entry_key, reaction)
);

alter table public.changelog_reactions enable row level security;
revoke all on table public.changelog_reactions from anon, authenticated;

comment on table public.changelog_votes is
  'Voto útil/não útil por versão das Patch Notes. Escrita só pela rota /api/changelog/feedback.';
comment on table public.changelog_reactions is
  'Reações por versão das Patch Notes. Escrita só pela rota /api/changelog/feedback.';

-- ---------------------------------------------------------------------------
-- 3. Totais por versão. Uma leitura para a página inteira (31 versões), em
--    vez de uma consulta por card.
-- ---------------------------------------------------------------------------
create or replace function public.changelog_feedback_totals()
returns table(entry_key text, kind text, total bigint)
language sql
stable
set search_path = public
as $$
  select v.entry_key, case when v.value = 1 then 'up' else 'down' end, count(*)
  from public.changelog_votes v
  group by 1, 2
  union all
  select r.entry_key, r.reaction, count(*)
  from public.changelog_reactions r
  group by 1, 2;
$$;

revoke execute on function public.changelog_feedback_totals() from public, anon, authenticated;
grant execute on function public.changelog_feedback_totals() to service_role;
