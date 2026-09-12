-- RESTAURADA A PARTIR DO BANCO REMOTO (2026-09-12).
--
-- Esta migration foi aplicada direto no banco, sem que o arquivo
-- chegasse ao repositório — o histórico local e o remoto divergiram, e
-- `supabase db push` passou a recusar QUALQUER migration nova com
-- LegacyDbPushMissingLocalError. O conteúdo abaixo é o SQL real gravado
-- em `supabase_migrations.schema_migrations`, recuperado para o repo.
--
-- NÃO reexecutar manualmente: já está aplicada no remoto. O arquivo
-- existe para o histórico bater e para o próximo `db push` funcionar.
-- Ver AGENTS.md, seção de drift de histórico.

-- ============================================================================
-- Correção de 20261104000000: os revokes de prune_offers_cache, notify_restock
-- e notification_actor_name não pegaram.
--
-- Motivo: o EXECUTE dessas três não estava concedido a `anon`/`authenticated`
-- nominalmente, e sim ao pseudo-role `PUBLIC` (entrada `=X/postgres` no
-- pg_proc.proacl, que é o default do Postgres ao criar função). `revoke ...
-- from anon, authenticated` não remove um grant que veio de PUBLIC, então a
-- instrução rodou sem erro e sem efeito nenhum.
--
-- Conferido em pg_proc.proacl que `postgres` e `service_role` têm grant
-- EXPLÍCITO nas três, então revogar de PUBLIC não afeta rota nem trigger:
--   prune_offers_cache      =X/postgres | postgres=X/postgres | service_role=X/postgres
--   notify_restock          =X/postgres | postgres=X/postgres | service_role=X/postgres
--   notification_actor_name =X/postgres | postgres=X/postgres | service_role=X/postgres
--
-- As demais SECURITY DEFINER sensíveis já estavam corretas (só postgres +
-- service_role): purchase_vip_with_aura, redeem_aura_item, toggle_forum_aura,
-- request_affiliate_payout, mark_affiliate_payout_paid, admin_ban_account,
-- anonymize_user_data, activate_vip_subscription, register_referral etc.
--
-- Seguem com grant nominal para anon/authenticated, de propósito, por só
-- devolverem agregado sobre conteúdo já público:
--   get_activity_ranking_by_period, get_aura_ranking_by_period,
--   get_forum_posts_comment_summary, get_forum_posts_saved_counts
-- ============================================================================

revoke execute on function public.prune_offers_cache(integer)        from public;
revoke execute on function public.notify_restock(uuid, uuid)         from public;
revoke execute on function public.notification_actor_name(uuid)      from public
