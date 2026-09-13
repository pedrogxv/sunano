-- Remove o GRANT de escrita de anon/authenticated nas tabelas em que ele já é
-- superfície morta: nenhuma delas tem policy de escrita, então hoje o que
-- barra a API REST é só a RLS-sem-policy.
--
-- Motivo (varredura de 13/09/2026): funcionar por ausência de policy é UMA
-- camada. `store_orders`, `store_products` e `store_settings` ficaram assim
-- depois de 20261109000000, que revogou o grant em 14 tabelas mas não nestas.
-- O risco não é hoje: é o dia em que alguém criar uma policy de escrita (para
-- um caso legítimo e estreito) numa tabela que ainda tem o grant aberto —
-- a policy passa a valer para TODA a tabela, sem rate limit, sem filtro de
-- conteúdo e sem as regras que vivem nas rotas do Next. Com o grant revogado,
-- uma policy nova sozinha não reabre nada.
--
-- `user_profiles` já tinha as duas camadas (grant revogado E RLS); esta
-- migration estende o mesmo padrão para o resto.
--
-- Critério da lista: toda tabela de `public` com grant de INSERT/UPDATE/DELETE
-- para anon ou authenticated e ZERO policies de escrita. Ficam de fora, de
-- propósito, as 9 tabelas cuja escrita direta é legítima e coberta por policy
-- `auth.uid() = user_id` (notifications, store_restock_alerts, forum_saved_posts,
-- user_favorite_peripherals, user_setup_items, user_tierlist_*, audit_log) —
-- revogar o grant delas quebraria funcionalidade real.
--
-- Toda escrita destas tabelas no código já usa service role (repositórios em
-- lib/server/repositories/*), que tem rolbypassrls e NÃO é afetado por revoke
-- de grant para anon/authenticated. As policies de SELECT ficam intactas.

do $$
declare
  v_table text;
  v_count int := 0;
begin
  for v_table in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      -- tem grant de escrita para algum papel de cliente
      and (
        has_table_privilege('anon',          'public.' || c.relname, 'INSERT') or
        has_table_privilege('anon',          'public.' || c.relname, 'UPDATE') or
        has_table_privilege('anon',          'public.' || c.relname, 'DELETE') or
        has_table_privilege('authenticated', 'public.' || c.relname, 'INSERT') or
        has_table_privilege('authenticated', 'public.' || c.relname, 'UPDATE') or
        has_table_privilege('authenticated', 'public.' || c.relname, 'DELETE')
      )
      -- e NENHUMA policy de escrita que dependa desse grant
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
          and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      )
  loop
    execute format(
      'revoke insert, update, delete, truncate on public.%I from public, anon, authenticated',
      v_table
    );
    v_count := v_count + 1;
  end loop;

  raise notice 'grants de escrita revogados em % tabelas', v_count;
end $$;
