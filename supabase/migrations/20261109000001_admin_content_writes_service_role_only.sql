-- Continuação de 20261109000000, para `blog_posts` e `admin_profiles`.
--
-- APLICAR DEPOIS DO DEPLOY do código que acompanha esta migration: até ele,
-- `app/api/admin/blog/route.ts` e `app/api/admin/profile/route.ts` escrevem
-- com a SESSÃO do admin (não com service role), e aplicar antes derrubaria o
-- salvamento de artigo e a edição do perfil administrativo. Depois do deploy
-- as duas rotas usam service role, atrás das mesmas checagens de cargo e
-- permissão de sempre.
--
-- O que isso fecha: com política de escrita para `authenticated`, quem tivesse
-- só a SENHA de um admin (sem o segundo fator, que o banco não conhece)
-- escrevia em `blog_posts` direto pela API REST do Supabase; e a política de
-- UPDATE em `admin_profiles` era o caminho para um WEB MASTER alterar cargo
-- de outra pessoa fora do painel (a trigger de guarda libera webmaster).

do $$
declare
  v_table text;
  v_policy record;
  v_tables text[] := array['blog_posts', 'admin_profiles'];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is null then
      raise notice 'tabela % não existe, pulando', v_table;
      continue;
    end if;

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
