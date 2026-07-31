-- Diretório de pessoas (`/pessoas`): contador de visitas, mini banner e
-- o grafo de "seguir" entre membros.
--
-- Contexto: até aqui um perfil só era alcançável por link direto — não havia
-- como descobrir outros membros nem acompanhar alguém. Esta migration cria o
-- suporte de dados para a página de descoberta e para o botão "Seguir".
--
-- Como em 20260728000001_public_profile_showcase.sql, as leituras acontecem nos
-- repositórios de `lib/server/**` via cliente service-role (bypassa RLS). As
-- policies abaixo são defesa em profundidade caso alguém acesse via SDK.

-- ────────────────────────────────────────────
-- 1. Contador de visitas ao perfil público
--    Um contador na própria linha basta para o ranking aproximado de
--    popularidade que o produto quer, e evita uma tabela de eventos
--    (quem visitou quem) que a LGPD obrigaria a justificar e expurgar.
-- ────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists profile_views integer not null default 0;

comment on column public.user_profiles.profile_views is
  'Contador de visitas ao perfil público, incrementado via increment_profile_views(). Não conta visitas do próprio dono.';

-- SECURITY DEFINER + grant só para service_role: mesma postura de
-- add_favorite_peripheral em 20260728000003_atomic_favorite_like.sql. Exposta a
-- `authenticated`, a função viraria uma forma de inflar a contagem de
-- qualquer perfil via RPC direto.
create or replace function public.increment_profile_views(p_user_id uuid)
returns void language sql security definer
set search_path = public as $$
  update public.user_profiles
     set profile_views = profile_views + 1
   where id = p_user_id;
$$;

revoke execute on function public.increment_profile_views(uuid) from public, anon, authenticated;
grant execute on function public.increment_profile_views(uuid) to service_role;

-- Suporta `order by profile_views desc` sem varrer a tabela inteira.
create index if not exists user_profiles_profile_views_idx
  on public.user_profiles (profile_views desc);

-- ────────────────────────────────────────────
-- 2. Mini banner — a faixa curta atrás do avatar no card de `/pessoas` e no
--    topo do perfil. É uma imagem separada de `banner_url` porque a
--    proporção é outra (faixa larga e baixa): reaproveitar a capa grande
--    cortaria o assunto da imagem fora em quase todos os casos.
-- ────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists mini_banner_url text;

comment on column public.user_profiles.mini_banner_url is
  'Faixa curta exibida atrás do avatar no card do diretório e no mini perfil. GIF só anima para contas vip/vip_plus, igual a banner_url.';

-- ────────────────────────────────────────────
-- 3. Grafo de seguidores
--    A PK composta (follower_id, following_id) já garante idempotência:
--    seguir duas vezes é um conflito, não uma linha duplicada.
-- ────────────────────────────────────────────
create table if not exists public.user_follows (
  follower_id  uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  -- Ninguém segue a si mesmo: a UI já esconde o botão, mas a regra precisa
  -- valer também para escrita direta via SDK.
  constraint user_follows_no_self check (follower_id <> following_id)
);

-- "Quem esta pessoa segue" usa a PK; "quem segue esta pessoa" (o contador
-- exibido no perfil) precisa do índice na outra ponta.
create index if not exists user_follows_following_idx
  on public.user_follows (following_id);

alter table public.user_follows enable row level security;

-- Seguir é público — o contador aparece no perfil de qualquer um.
drop policy if exists "Follows are publicly readable" on public.user_follows;
create policy "Follows are publicly readable"
  on public.user_follows for select using (true);

-- Só dá para seguir/deixar de seguir em nome próprio.
drop policy if exists "Users can follow" on public.user_follows;
create policy "Users can follow"
  on public.user_follows for insert
  with check (auth.uid() = follower_id);

drop policy if exists "Users can unfollow" on public.user_follows;
create policy "Users can unfollow"
  on public.user_follows for delete
  using (auth.uid() = follower_id);

comment on table public.user_follows is
  'Grafo de seguidores entre membros. Lido pelos repositórios em lib/server/repositories/users-repository.ts.';
