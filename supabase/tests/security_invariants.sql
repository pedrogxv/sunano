-- Invariantes de seguranca do banco (varredura 4 de RLS, 13/09/2026).
--
-- Rodar depois de qualquer migration:
--   npx supabase db query --linked -f supabase/tests/security_invariants.sql
--
-- Resultado esperado: NENHUMA linha. Cada linha e uma violacao.
--
-- Modelo que o script protege: dado de negocio so passa pelas rotas do Next com
-- service_role. A chave anon e a sessao do usuario nao escrevem em tabela
-- nenhuma e so leem as tabelas de conteudo publico da allowlist abaixo.
-- Tabela nova de conteudo publico entra na allowlist no mesmo commit que cria
-- o grant de SELECT.

with public_read(tbl) as (
  values
    ('achievements'), ('aura_items'), ('blog_comments'), ('blog_posts'), ('brands'),
    ('events'), ('forum_categories'), ('forum_comments'), ('forum_post_peripherals'),
    ('forum_posts'), ('home_banners'), ('medals'), ('offers'), ('offers_cache'),
    ('peripheral_comments'), ('peripheral_reviews'), ('peripherals'),
    ('store_product_peripherals'), ('store_product_reviews'), ('store_product_specs'),
    ('store_product_sunano_reviews'), ('store_product_variant_combinations'),
    ('store_product_variant_group_options'), ('store_product_variant_groups'),
    ('store_product_variant_images'), ('store_product_variants'), ('store_products'),
    ('store_section_banners'), ('tierlist_meta'), ('user_achievements'),
    ('user_aura_items'), ('user_favorite_peripherals'), ('user_follows'),
    ('user_medals'), ('user_setup_items'), ('user_streak_shields'), ('user_streaks'),
    ('user_tierlist_hearts'), ('user_tierlist_items'), ('user_tierlist_meta'),
    ('user_tierlist_tiers'), ('youtube_cache_snapshots')
),
client_roles(r) as (
  values ('anon'), ('authenticated')
),
tables as (
  select c.oid, c.relname, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
)

-- Tabela sem RLS
select 'rls_desligada' as violacao, relname as objeto
from tables
where not relrowsecurity

union all
-- Grant de escrita para cliente (tabela inteira)
select 'escrita_de_cliente', t.relname || ' ' || cr.r || ' ' || v.p
from tables t
cross join client_roles cr
cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) v(p)
where has_table_privilege(cr.r, t.oid, v.p)

union all
-- Grant de escrita para cliente (por coluna)
select 'escrita_de_cliente_por_coluna', t.relname || ' ' || cr.r || ' ' || v.p
from tables t
cross join client_roles cr
cross join (values ('INSERT'), ('UPDATE')) v(p)
where not has_table_privilege(cr.r, t.oid, v.p)
  and has_any_column_privilege(cr.r, t.oid, v.p)

union all
-- Policy de INSERT/UPDATE/DELETE/ALL que nao seja um "false" explicito
select 'policy_de_escrita', tablename || ' "' || policyname || '" ' || cmd
from pg_policies
where schemaname = 'public'
  and cmd <> 'SELECT'
  and not (qual = 'false' and coalesce(with_check, 'false') = 'false')

union all
-- Leitura de cliente fora da allowlist de conteudo publico. admin_profiles e a
-- excecao: as rotas do painel leem o proprio cargo pela sessao.
select 'leitura_fora_da_allowlist', t.relname || ' ' || cr.r
from tables t
cross join client_roles cr
where has_any_column_privilege(cr.r, t.oid, 'SELECT')
  and t.relname not in (select tbl from public_read)
  and not (t.relname = 'admin_profiles' and cr.r = 'authenticated')

union all
-- Coluna de PII, segredo, pagamento ou pedido legivel por cliente
select 'coluna_sensivel_legivel', t.relname || '.' || a.attname || ' ' || cr.r
from pg_attribute a
join tables t on t.oid = a.attrelid
cross join client_roles cr
where a.attnum > 0
  and not a.attisdropped
  and a.attname ~ '((^|_)(cpf|ip|phone|email|token|secret|password|pix|asaas)(_|$))|(^|_)order_id$'
  and has_column_privilege(cr.r, a.attrelid, a.attnum, 'SELECT')
  and not (t.relname = 'admin_profiles' and a.attname = 'email')

union all
-- SECURITY DEFINER chamavel pela REST (funcao de trigger nao e chamavel)
select 'security_definer_exposta', p.oid::regprocedure::text || ' ' || cr.r
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join client_roles cr
where n.nspname = 'public'
  and p.prosecdef
  and p.prorettype <> 'trigger'::regtype::oid
  and has_function_privilege(cr.r, p.oid, 'EXECUTE')

union all
select 'security_definer_sem_search_path', p.oid::regprocedure::text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and not exists (
    select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg where cfg like 'search_path=%'
  )

union all
-- View legivel por cliente que roda com o dono (fura a RLS das tabelas base)
select 'view_sem_security_invoker', c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('v', 'm')
  and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT'))
  and not coalesce(c.reloptions::text like '%security_invoker=true%', false)

union all
-- Qualquer policy em storage.objects: upload e leitura privada sao do servidor
select 'policy_no_storage', '"' || policyname || '" ' || cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'

union all
select 'bucket_sem_limite', id
from storage.buckets
where file_size_limit is null or allowed_mime_types is null

union all
-- Tabela ou sequence nova em public voltaria a nascer aberta para cliente
select 'privilegio_default_para_cliente', d.defaclobjtype::text || ' ' || array_to_string(d.defaclacl, ' ')
from pg_default_acl d
where d.defaclrole = 'postgres'::regrole
  and d.defaclnamespace = 'public'::regnamespace
  and d.defaclobjtype in ('r', 'S')
  and exists (select 1 from unnest(d.defaclacl) acl where acl::text ~ '^(anon|authenticated)=')

order by 1, 2;
