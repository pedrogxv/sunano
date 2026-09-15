-- Recuperado de supabase_migrations.schema_migrations (aplicada em produção
-- sem o arquivo correspondente no repo). Conteúdo exatamente o que rodou no
-- banco; não re-executa, a versão já consta como aplicada no remoto.

-- Listagem paginada de usuários do admin (/admin/users).
--
-- Motivo: a rota GET /api/admin/users varria auth.users de 1000 em 1000 até o
-- fim, buscava admin_profiles e user_profiles INTEIRAS, juntava tudo em
-- memória no Node e mandava o array completo pro navegador, que renderizava
-- um card por usuário. Busca, filtro de cargo e contadores eram todos
-- client-side sobre esse array. Não havia paginação em lugar nenhum: a página
-- crescia linearmente com a base e já nasce lenta.
--
-- Esta função move busca, filtro, ordenação, contagem e recorte pro banco, e
-- devolve UMA página.
--
-- Por que auth.users é a tabela-base (e não user_profiles, que seria mais
-- simples): user_profiles é preenchida por código da aplicação
-- (upsertUserProfileFromAuth), não por trigger em auth.users, e esse upsert
-- engole erro de propósito pra não travar login. O resultado é que hoje
-- existem contas autenticáveis SEM linha em user_profiles (as órfãs de OAuth).
-- Paginar por user_profiles esconderia justamente as contas quebradas que o
-- admin mais precisa achar. auth.users é a única fonte completa.
--
-- security definer porque auth.users não é exposta a nenhum role do PostgREST.
-- A autorização (somente WEB Master) continua na rota do Next, que chama isto
-- com service role; o execute é revogado de anon/authenticated.

create or replace function public.admin_list_users(
  p_search      text    default null,
  -- 'all' | 'user' | um cargo de admin_profiles
  p_role        text    default 'all',
  -- 'all' | 'banned' | 'vip' | 'store_access' | 'no_profile'
  p_status      text    default 'all',
  -- 'recent' | 'oldest' | 'name-asc' | 'name-desc' | 'email-asc'
  p_sort        text    default 'recent',
  p_limit       int     default 24,
  p_offset      int     default 0
) returns table (
  id                 uuid,
  email              text,
  display_name       text,
  avatar_url         text,
  role               text,
  account_tier       text,
  vip_expires_at     timestamptz,
  display_slug       text,
  account_banned_at  timestamptz,
  account_ban_reason text,
  store_access       boolean,
  has_profile        boolean,
  last_sign_in_at    timestamptz,
  created_at         timestamptz,
  updated_at         timestamptz,
  total_count        bigint
)
language sql security definer
set search_path = public, auth as $$
  with base as (
    select
      u.id,
      u.email::text                                    as email,
      coalesce(
        nullif(btrim(ap.display_name), ''),
        nullif(btrim(up.display_name), ''),
        split_part(coalesce(u.email::text, ''), '@', 1),
        'Usuário'
      )                                                as display_name,
      coalesce(ap.avatar_url, up.avatar_url)           as avatar_url,
      coalesce(ap.role, 'user')                        as role,
      coalesce(up.account_tier, 'common')              as account_tier,
      up.vip_expires_at,
      up.display_slug,
      up.account_banned_at,
      up.account_ban_reason,
      coalesce(up.store_access, false)                 as store_access,
      (up.id is not null)                              as has_profile,
      u.last_sign_in_at,
      u.created_at,
      coalesce(ap.updated_at, u.created_at)            as updated_at
    from auth.users u
    left join public.admin_profiles ap on ap.id = u.id
    left join public.user_profiles  up on up.id = u.id
  ),
  filtered as (
    select * from base b
    where
      (p_role = 'all' or b.role = p_role)
      and (
        p_status = 'all'
        or (p_status = 'banned'       and b.account_banned_at is not null)
        or (p_status = 'vip'          and b.account_tier = 'vip')
        or (p_status = 'store_access' and b.store_access)
        or (p_status = 'no_profile'   and not b.has_profile)
      )
      and (
        p_search is null
        or btrim(p_search) = ''
        or b.display_name ilike '%' || btrim(p_search) || '%'
        or coalesce(b.email, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(b.display_slug, '') ilike '%' || btrim(p_search) || '%'
        -- Deixa colar o UUID direto da URL/log e cair no usuário certo.
        or b.id::text = btrim(p_search)
      )
  )
  select
    f.id, f.email, f.display_name, f.avatar_url, f.role, f.account_tier,
    f.vip_expires_at, f.display_slug, f.account_banned_at, f.account_ban_reason,
    f.store_access, f.has_profile, f.last_sign_in_at, f.created_at, f.updated_at,
    count(*) over () as total_count
  from filtered f
  order by
    case when p_sort = 'name-asc'   then lower(f.display_name) end asc,
    case when p_sort = 'name-desc'  then lower(f.display_name) end desc,
    case when p_sort = 'email-asc'  then lower(coalesce(f.email, '')) end asc,
    case when p_sort = 'oldest'     then f.created_at end asc,
    case when p_sort = 'recent'     then f.created_at end desc,
    -- Desempate estável: sem isto, duas contas criadas no mesmo instante
    -- podem trocar de página entre uma requisição e outra.
    f.created_at desc, f.id
  limit  greatest(1, least(coalesce(p_limit, 24), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke execute on function public.admin_list_users(text, text, text, text, int, int) from public, anon, authenticated;

grant  execute on function public.admin_list_users(text, text, text, text, int, int) to service_role;

-- Contadores dos cards de topo. Separado da listagem porque eles descrevem a
-- base TODA e não podem mudar quando o admin filtra ou vira de página — antes
-- eram derivados do array completo no cliente, que é justamente o que estamos
-- deixando de carregar.
create or replace function public.admin_user_stats()
returns table (
  total        bigint,
  regular      bigint,
  banned       bigint,
  vip          bigint,
  store_access bigint,
  no_profile   bigint,
  new_30d      bigint,
  active_30d   bigint,
  by_role      jsonb
)
language sql security definer
set search_path = public, auth as $$
  with base as (
    select
      u.id,
      coalesce(ap.role, 'user')           as role,
      coalesce(up.account_tier, 'common') as account_tier,
      up.account_banned_at,
      coalesce(up.store_access, false)    as store_access,
      (up.id is not null)                 as has_profile,
      u.last_sign_in_at,
      u.created_at
    from auth.users u
    left join public.admin_profiles ap on ap.id = u.id
    left join public.user_profiles  up on up.id = u.id
  )
  select
    count(*)                                                              as total,
    count(*) filter (where role = 'user')                                 as regular,
    count(*) filter (where account_banned_at is not null)                 as banned,
    count(*) filter (where account_tier = 'vip')                          as vip,
    count(*) filter (where store_access)                                  as store_access,
    count(*) filter (where not has_profile)                               as no_profile,
    count(*) filter (where created_at > now() - interval '30 days')       as new_30d,
    count(*) filter (where last_sign_in_at > now() - interval '30 days')  as active_30d,
    coalesce(
      (select jsonb_object_agg(r.role, r.n)
         from (select role, count(*) as n from base where role <> 'user' group by role) r),
      '{}'::jsonb
    )                                                                     as by_role
  from base;
$$;

revoke execute on function public.admin_user_stats() from public, anon, authenticated;

grant  execute on function public.admin_user_stats() to service_role;
