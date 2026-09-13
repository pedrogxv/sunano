-- Fecha a escrita direta (PostgREST) que sobrou depois de 20261109000000 e
-- 20261110000000, e tira de anon/authenticated o que só o service role usa.
--
-- Motivo (varredura de 13/09/2026):
--
--   * user_tierlist_meta: a policy "Owners can toggle their tierlist
--     visibility" dava UPDATE em TODAS as colunas, inclusive `note`, a qualquer
--     dono de linha (até VIP expirado). Com a anon key e o próprio token, o
--     recado público da tierlist era gravado sem o filtro de conteúdo
--     (`checkContent`) e sem o rate limit de /api/perfil/tierlist/nota.
--     user_tierlist_items/tiers tinham o mesmo caminho paralelo às rotas.
--   * notifications: o dono podia reescrever title, body e link.
--   * 20261110000000 deixou estas tabelas de fora supondo que a escrita direta
--     era usada. Não é: nenhum client de sessão ou de browser escreve nelas.
--     Toda escrita passa pelos repositórios com service role
--     (user-tierlist, notifications, forum-saved-posts, store-restock,
--     profile-showcase) e pelas rotas admin, no caso do audit_log.
--   * offers: "Authenticated can read offers" (USING true) expunha oferta
--     inativa ou expirada e `created_by` a qualquer usuário logado.
--   * get_aura_ranking_by_period / get_activity_ranking_by_period: SECURITY
--     DEFINER, executáveis pelo anon e sem teto de p_limit (enumeração de
--     usuários e varredura completa a cada chamada). Só o servidor chama.
--   * Tabelas sem nenhuma policy (ou só com policy `false`) ainda tinham grant
--     de leitura e escrita para anon/authenticated, barradas só pela RLS.
--
-- service_role tem rolbypassrls e não é afetado por revoke para
-- anon/authenticated. As policies de SELECT que o site usa ficam intactas.

-- 1. Policies de escrita direta -------------------------------------------------

drop policy if exists "Owners can toggle their tierlist visibility" on public.user_tierlist_meta;
drop policy if exists "VIP users can manage their own tierlist meta" on public.user_tierlist_meta;
drop policy if exists "VIP users can manage their own tierlist" on public.user_tierlist_items;
drop policy if exists "VIP users can manage their own tiers" on public.user_tierlist_tiers;
drop policy if exists "Users update their own notifications" on public.notifications;
drop policy if exists "Users delete their own notifications" on public.notifications;
drop policy if exists "restock alerts own insert" on public.store_restock_alerts;
drop policy if exists "restock alerts own delete" on public.store_restock_alerts;
drop policy if exists "Users can manage their own favorites" on public.user_favorite_peripherals;
drop policy if exists "Users can manage their own setup" on public.user_setup_items;

-- forum_saved_posts: a policy ALL também era a única de leitura. A leitura do
-- próprio usuário continua existindo, só a escrita sai.
drop policy if exists "Users manage their own saved posts" on public.forum_saved_posts;
drop policy if exists "Users read their own saved posts" on public.forum_saved_posts;
create policy "Users read their own saved posts"
  on public.forum_saved_posts
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 2. Grants de escrita ----------------------------------------------------------

revoke insert, update, delete, truncate
  on public.user_tierlist_meta,
     public.user_tierlist_items,
     public.user_tierlist_tiers,
     public.notifications,
     public.store_restock_alerts,
     public.user_favorite_peripherals,
     public.user_setup_items,
     public.forum_saved_posts,
     public.audit_log
  from public, anon, authenticated;

-- A view não aceita escrita (GROUP BY), mas o grant não tem motivo para existir.
revoke insert, update, delete
  on public.user_tierlist_public_summary
  from public, anon, authenticated;

-- 3. Ofertas --------------------------------------------------------------------

drop policy if exists "Authenticated can read offers" on public.offers;

-- 4. RPCs de ranking ------------------------------------------------------------

revoke execute on function public.get_aura_ranking_by_period(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.get_aura_ranking_by_period(timestamptz, integer)
  to service_role;

revoke execute on function public.get_activity_ranking_by_period(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.get_activity_ranking_by_period(timestamptz, integer)
  to service_role;

-- 5. Tabelas só de service role -------------------------------------------------
--
-- Critério: RLS ligada e nenhuma policy que libere algo (sem policy, ou só
-- policies `false`). Para anon/authenticated essas tabelas já devolvem vazio;
-- tirar o grant garante que uma policy criada no futuro não reabra a tabela
-- inteira sozinha.

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
      and c.relrowsecurity
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
          and coalesce(p.qual, p.with_check, '') <> 'false'
      )
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', v_table);
    v_count := v_count + 1;
  end loop;

  raise notice 'grants de anon/authenticated revogados em % tabelas sem policy', v_count;
end $$;
