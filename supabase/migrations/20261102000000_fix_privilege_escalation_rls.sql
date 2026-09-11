-- ============================================================================
-- Correção de escalação de privilégio (incidente 2026-09-11)
--
-- Duas falhas permitiam que QUALQUER usuário autenticado se tornasse admin ou
-- VIP escrevendo direto na API REST do Supabase com o token de sessão comum:
--
--  1. admin_profiles: o predicado `auth.uid() = id` no INSERT deixava o usuário
--     criar a PRÓPRIA linha de admin com role 'webmaster'. UPDATE/DELETE com o
--     mesmo predicado permitiam auto-promoção e remoção de outros admins.
--  2. user_profiles: a policy `for all using (auth.uid() = id)` não restringia
--     COLUNAS — account_tier, store_access, vip_expires_at etc. eram editáveis
--     pelo cliente, contornando checkout/pagamento.
--
-- Estratégia:
--  * admin_profiles: cliente perde INSERT e DELETE (exclusivos do service_role,
--    que já roda nas rotas /api/admin/* com checagem de permissão). UPDATE do
--    dono não pode mais tocar role/permissions (guard por trigger).
--  * user_profiles: dono mantém INSERT/UPDATE da própria linha, mas um trigger
--    BEFORE impede alteração de colunas de privilégio/punição por qualquer ator
--    que NÃO seja service_role.
--
-- Triggers (não policies com subselect) fazem o guard de coluna: só no trigger
-- existem OLD/NEW, e a comparação é confiável. RLS com subselect na própria
-- tabela falha silenciosamente (rows=0) e é frágil.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. admin_profiles — remove escrita de estrutura pelo cliente
-- ---------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'admin_profiles'
  loop
    execute format('drop policy %I on public.admin_profiles', pol.policyname);
  end loop;
end $$;

create policy "Admin profiles readable by owner or webmaster"
on public.admin_profiles for select to authenticated
using (auth.uid() = id or public.is_webmaster());

-- Dono pode atualizar a própria linha (dados cosméticos). role/permissions são
-- travados pelo trigger abaixo. Webmaster tem passe livre.
create policy "Admin profiles self or webmaster update"
on public.admin_profiles for update to authenticated
using (auth.uid() = id or public.is_webmaster())
with check (auth.uid() = id or public.is_webmaster());

-- Sem INSERT nem DELETE para authenticated: criar/remover admin é exclusivo do
-- service_role (rotas administrativas), que ignora RLS.

create or replace function public.guard_admin_profiles_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  -- service_role (rotas /api/admin/*) pode tudo; webmaster também.
  if coalesce(current_setting('request.jwt.claims', true)::json->>'role','') = 'service_role'
     or auth.role() = 'service_role'
     or public.is_webmaster() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.permissions is distinct from old.permissions then
    raise exception 'Alteração de role/permissions não permitida (privilege escalation)'
      using errcode = '42501';
  end if;
  return new;
end $fn$;

drop trigger if exists trg_guard_admin_profiles_privileged on public.admin_profiles;
create trigger trg_guard_admin_profiles_privileged
  before update on public.admin_profiles
  for each row execute function public.guard_admin_profiles_privileged_columns();

-- ---------------------------------------------------------------------------
-- 2. user_profiles — trava colunas sensíveis pelo cliente
-- ---------------------------------------------------------------------------
drop policy if exists "Users can manage their own profile" on public.user_profiles;
drop policy if exists "Users can insert their own profile" on public.user_profiles;
drop policy if exists "Users can update their own profile" on public.user_profiles;

create policy "Users can insert their own profile"
on public.user_profiles for insert to authenticated
with check (auth.uid() = id);

create policy "Users can update their own profile"
on public.user_profiles for update to authenticated
using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.guard_user_profiles_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  -- service_role (checkout, webhooks, rotas admin) pode alterar tudo.
  if coalesce(current_setting('request.jwt.claims', true)::json->>'role','') = 'service_role'
     or auth.role() = 'service_role' then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    -- conta nova nasce sempre sem privilégio, independente do que o cliente mande
    new.account_tier   := 'common';
    new.vip_expires_at := null;
    new.account_banned_at := null;
    new.market_banned_at  := null;
    return new;
  end if;

  -- UPDATE: colunas de privilégio/punição são revertidas ao valor antigo se o
  -- cliente tentar alterá-las (silent revert, igual ao padrão de store_access:
  -- assim um "salvar perfil" que reenvie a linha inteira não quebra).
  -- store_access já é coberto pelo trigger trg_enforce_store_access_grant.
  new.account_tier      := old.account_tier;
  new.vip_expires_at    := old.vip_expires_at;
  new.account_banned_at := old.account_banned_at;
  new.market_banned_at  := old.market_banned_at;
  new.profile_views     := old.profile_views;
  return new;
end $fn$;

drop trigger if exists trg_guard_user_profiles_privileged on public.user_profiles;
create trigger trg_guard_user_profiles_privileged
  before insert or update on public.user_profiles
  for each row execute function public.guard_user_profiles_privileged_columns();

-- ---------------------------------------------------------------------------
-- 3. user_profiles — policy de SELECT do dono
--
-- A migration 20260718 removeu a policy pública "User profiles are publicly
-- readable" (using true) e nunca recriou nenhuma de SELECT. Sem SELECT policy,
-- o PostgREST não "enxerga" a própria linha do usuário, então UPDATE do dono
-- afeta 0 linhas (retorna 204 vazio) — mascarando escrita legítima e falha.
-- Leitura pública de perfil continua via service_role (repositories), então
-- basta o dono conseguir ler a própria linha para o UPDATE funcionar.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can read their own profile" on public.user_profiles;
create policy "Users can read their own profile"
on public.user_profiles for select to authenticated
using (auth.uid() = id);
