-- Fila de denúncias de posts e comentários do fórum.
--
-- Denúncia é direta (um clique, sem motivo) — ver decisão do produto. O que
-- importa pra moderação é volume e qual conteúdo foi sinalizado, não o texto
-- de justificativa. `comment_id` sempre carrega o `post_id` pai junto (mesmo
-- denunciando um comentário), pra fila de moderação mostrar contexto sem
-- precisar de join adicional.
--
-- Todo acesso passa pelo `createSupabaseAdminClient` (service role) nos
-- repositórios (ver ARQUITETURA.md) — RLS aqui é a segunda camada, não a
-- única, e mantém o PostgREST fechado por padrão caso algum client bata
-- direto no Supabase.

create table if not exists public.forum_reports (
  id                uuid primary key default gen_random_uuid(),
  target_type       text not null check (target_type in ('post', 'comment')),
  post_id           uuid not null references public.forum_posts(id) on delete cascade,
  comment_id        uuid references public.forum_comments(id) on delete cascade,
  reporter_user_id  uuid not null references auth.users(id) on delete cascade,
  status            text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  created_at        timestamptz not null default now(),
  reviewed_at        timestamptz,
  constraint forum_reports_target_shape check (
    (target_type = 'post' and comment_id is null) or
    (target_type = 'comment' and comment_id is not null)
  ),
  -- Um usuário só denuncia o mesmo alvo uma vez. `coalesce` porque `comment_id`
  -- é null em denúncia de post, e colunas null nunca colidem num índice único.
  unique (target_type, post_id, coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid), reporter_user_id)
);

create index if not exists idx_forum_reports_status_created
  on public.forum_reports (status, created_at desc);

comment on column public.forum_reports.post_id is
  'Post denunciado, ou post-pai do comentário denunciado — sempre presente, mesmo para target_type = comment.';

alter table public.forum_reports enable row level security;

-- Ninguém lê/atualiza/apaga pelo PostgREST — só o admin, via service role
-- (repositório de moderação). Inserir também passa pelo repositório, mas a
-- policy fica pronta caso o insert venha a ser feito direto do client no futuro.
drop policy if exists "Users insert their own report" on public.forum_reports;
create policy "Users insert their own report"
  on public.forum_reports for insert
  with check (auth.uid() = reporter_user_id);
