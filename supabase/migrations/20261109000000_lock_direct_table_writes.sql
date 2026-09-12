-- Fecha a escrita DIRETA (PostgREST, chave anon + sessão do próprio usuário)
-- nas tabelas em que toda a regra de negócio vive nas rotas do Next.
--
-- Motivo (varredura de 11/09/2026): a chave anon é pública e o access token é
-- do próprio usuário, então qualquer política de escrita para `authenticated`
-- é um caminho paralelo às rotas, sem rate limit, sem filtro de conteúdo, sem
-- checagem de posse de item, sem 2FA e sem o ban de conta (que hoje só existe
-- como coluna em `user_profiles`). Exemplos reais confirmados no banco:
--
--   * `user_profiles`: a trigger de guarda só protege account_tier,
--     vip_expires_at, account_banned_at, market_banned_at, profile_views e
--     store_access. `created_at` (que alimenta `get_giver_trust_tier` e,
--     portanto, o limite anti-farm de Aura), `display_name` (pago com Aura,
--     com cooldown e lista de nomes reservados só no app) e
--     `equipped_avatar_frame_id`/`equipped_mini_profile_bg_id` (sem checagem
--     de posse no banco) eram livres.
--   * `forum_posts`: INSERT direto escolhia `is_pinned`, `aura_count`,
--     `created_at` e categoria, além de pular o filtro de conteúdo.
--
-- TODA escrita dessas tabelas no código já usa service role (repositórios em
-- lib/server/repositories/*), então nada de legítimo depende destas políticas.
-- As políticas de SELECT ficam intactas: o proxy e as páginas leem com a
-- sessão do usuário.
--
-- Fora desta migration, de propósito: `blog_posts` e `admin_profiles`, cujas
-- rotas ainda escreviam com a sessão até o deploy que acompanha este arquivo.
-- Ver 20261109000001.

do $$
declare
  v_table text;
  v_policy record;
  v_tables text[] := array[
    -- perfil e conteúdo do usuário
    'user_profiles',
    'forum_posts',
    'forum_comments',
    'blog_comments',
    'forum_reports',
    'user_follows',
    'user_tierlist_hearts',
    'support_tickets',
    'support_messages',
    -- conteúdo editorial/administrativo (só as rotas /api/admin/* escrevem)
    'peripherals',
    'home_banners',
    'store_section_banners',
    'tierlist_meta',
    'youtube_cache_snapshots'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is null then
      raise notice 'tabela % não existe, pulando', v_table;
      continue;
    end if;

    -- Remove só as políticas que permitem escrita. `cmd = 'ALL'` entra porque
    -- cobre INSERT/UPDATE/DELETE junto com o SELECT; onde havia leitura por
    -- ela, a política pública de SELECT da própria tabela continua valendo.
    for v_policy in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = v_table and cmd <> 'SELECT'
    loop
      execute format('drop policy %I on public.%I', v_policy.policyname, v_table);
    end loop;

    execute format(
      'revoke insert, update, delete on public.%I from public, anon, authenticated',
      v_table
    );
  end loop;
end $$;

-- Idade da conta passa a vir de `auth.users`, que o usuário não escreve.
-- `user_profiles.created_at` era editável pela API REST (fechado acima), e é
-- ele que decide o tier de confiança: uma conta criada hoje virava "verified"
-- na hora e furava o limite anti-farm de Aura, que compra periférico físico.
create or replace function public.get_giver_trust_tier(p_giver_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_created_at     timestamptz;
  v_account_tier   text;
  v_vip_expires_at timestamptz;
  v_account_age    interval;
  v_social_ok      boolean;
begin
  select u.created_at, p.account_tier, p.vip_expires_at
    into v_created_at, v_account_tier, v_vip_expires_at
  from public.user_profiles p
  join auth.users u on u.id = p.id
  where p.id = p_giver_id;

  if v_created_at is null then
    return 'new';
  end if;

  v_account_age := now() - v_created_at;

  if v_account_age < interval '3 days' then
    return 'new';
  end if;

  -- Conta social verificada: inscrito no YouTube OU membro confirmado do
  -- Discord. Basta uma. Quando a conquista do YouTube estiver religada, a
  -- primeira metade volta a pegar sozinha.
  select
    exists(select 1 from public.user_youtube_subscription where user_id = p_giver_id)
    or exists(select 1 from public.user_discord_membership where user_id = p_giver_id)
  into v_social_ok;

  if v_social_ok
    or public.is_vip_active(v_account_tier, v_vip_expires_at)
    or v_account_age >= interval '14 days'
  then
    return 'verified';
  end if;

  return 'normal';
end;
$function$;
