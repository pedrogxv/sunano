-- Posts salvos do fórum — cada usuário guarda posts pra ler depois.
--
-- Ao contrário de `forum_reports` (só admin lê), aqui o próprio usuário
-- também lê/insere/remove os próprios salvos, então a policy libera essas
-- operações sob `auth.uid() = user_id`. Mesmo assim, o repositório sempre
-- usa `createSupabaseAdminClient` (ver ARQUITETURA.md) — RLS aqui é a
-- segunda camada, não a única.

create table if not exists public.forum_saved_posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  post_id     uuid not null references public.forum_posts(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Um usuário só salva o mesmo post uma vez — toggle no repositório depende disso.
create unique index if not exists forum_saved_posts_user_post_unique
  on public.forum_saved_posts (user_id, post_id);

-- Lista "meus salvos" ordenada por data de salvamento, mais recente primeiro.
create index if not exists idx_forum_saved_posts_user_created
  on public.forum_saved_posts (user_id, created_at desc);

alter table public.forum_saved_posts enable row level security;

drop policy if exists "Users manage their own saved posts" on public.forum_saved_posts;
create policy "Users manage their own saved posts"
  on public.forum_saved_posts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
