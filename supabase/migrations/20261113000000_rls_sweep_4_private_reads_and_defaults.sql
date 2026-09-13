-- Varredura 4 de RLS (13/09/2026), feita sobre o catalogo de producao.
--
-- Contexto: toda leitura e escrita de dado de negocio passa pelas rotas do Next
-- com service_role. O client do navegador so faz autenticacao
-- (lib/client/supabase-auth.ts) e o client de sessao do servidor so le a
-- propria linha de admin_profiles. As policies e grants removidos aqui nao
-- atendem nenhum caminho do app: so servem a quem chama /rest/v1 direto com a
-- chave anon e a propria sessao.
--
--  1. Leitura de dono em tabela privada.
--     - Um token aal1 (senha certa, sem o segundo fator) lia CPF, telefone e
--       enderecos de user_profiles pela REST, pulando o 2FA que o app exige.
--     - No "logar como" a sessao do alvo e real (generateLink + verifyOtp) e o
--       cookie sb-* e legivel no navegador: o WEB MASTER lia pela REST o CPF e
--       o endereco que a rota de impersonation esconde.
--     - referrals entregava signup_ip e signup_ip_prefix de quem se cadastrou
--       pelo link ao dono do codigo (tabela vazia hoje, exposicao latente).
--  2. offers_votes era publica com voter_hash = id do usuario, e
--     user_youtube_subscription era publica enquanto user_discord_membership e
--     so do dono.
--  3. store_product_reviews publica expunha order_id; offers expunha
--     created_by. Viram grant por coluna.
--  4. get_forum_posts_comment_summary / get_forum_posts_saved_counts: SECURITY
--     DEFINER executavel por anon (grant de PUBLIC). So o service_role chama
--     (lib/server/repositories/forum-repository.ts), e a de resumo nao olha se
--     o post esta oculto.
--  5. storage.objects: o SELECT do bucket peripherals so servia para LISTAR os
--     nomes (user-avatar-<uuid>, forum-post-<uuid>); download de bucket publico
--     nao passa por RLS. O de support ficou sem uso: a leitura assina com
--     service_role (lib/server/support-media.ts) e o upload passou a usar o
--     admin client no mesmo commit desta migration.
--  6. Privilegio default: tabela nova em public nascia com ALL para anon e
--     authenticated. Esquecer o "enable row level security" deixava a tabela
--     inteira gravavel pela chave anon. So da para alterar o default do role
--     postgres (quem roda as migrations); o de supabase_admin fica como esta.
--
-- Conferencia: supabase/tests/security_invariants.sql tem que voltar vazio.

-- ---------------------------------------------------------------------------
-- 1 e 2. Tabelas privadas: nenhuma leitura de cliente
-- ---------------------------------------------------------------------------
drop policy if exists "Users can read their own profile"          on public.user_profiles;
drop policy if exists "Users can read their own subscription"     on public.vip_subscriptions;
drop policy if exists "Users read their own notifications"        on public.notifications;
drop policy if exists "Users read their own tickets"              on public.support_tickets;
drop policy if exists "Users read messages of their own tickets"  on public.support_messages;
drop policy if exists "Referral parties read their own referrals" on public.referrals;
drop policy if exists "Users read their own referral code"        on public.referral_codes;
drop policy if exists "Users read their own verified identities"  on public.referral_verified_identities;
drop policy if exists "Users read their own aura ledger"          on public.aura_ledger;
drop policy if exists "Users read their own aura wallet"          on public.user_aura_wallet;
drop policy if exists "Users read their own daily missions"       on public.daily_missions;
drop policy if exists "Users read their own saved posts"          on public.forum_saved_posts;
drop policy if exists "Users read their own aura reactions"       on public.forum_aura;
drop policy if exists "restock alerts own select"                 on public.store_restock_alerts;
drop policy if exists "Own discord membership readable"           on public.user_discord_membership;
drop policy if exists "Youtube subscription is publicly readable" on public.user_youtube_subscription;
drop policy if exists "Offers votes are publicly readable"        on public.offers_votes;

revoke all on table
  public.user_profiles,
  public.vip_subscriptions,
  public.notifications,
  public.support_tickets,
  public.support_messages,
  public.referrals,
  public.referral_codes,
  public.referral_verified_identities,
  public.aura_ledger,
  public.user_aura_wallet,
  public.daily_missions,
  public.forum_saved_posts,
  public.forum_aura,
  public.store_restock_alerts,
  public.user_discord_membership,
  public.user_youtube_subscription,
  public.offers_votes
from anon, authenticated;

-- admin_profiles continua com a policy de dono/webmaster, porque as rotas do
-- painel leem o cargo pela sessao. A policy e so para authenticated.
revoke all on table public.admin_profiles from anon;

-- TRUNCATE nao passa por RLS e ainda estava concedido a anon/authenticated em
-- 15 tabelas (admin_profiles, user_profiles, forum_posts, peripherals...). A
-- REST e o GraphQL nao emitem TRUNCATE, mas e grant de escrita sobrando.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tabelas publicas com coluna que nao e publica
-- ---------------------------------------------------------------------------
revoke select on table public.store_product_reviews from anon, authenticated;
grant select (id, product_id, user_id, rating, title, body, is_verified_purchase, status, created_at, updated_at)
  on public.store_product_reviews to anon, authenticated;

revoke select on table public.offers from anon, authenticated;
grant select (id, name, description, value, currency, currency_symbol, coupon_code, link, status, expires_at, created_at, updated_at, image_url, peripheral_id)
  on public.offers to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPCs SECURITY DEFINER chamadas so pelo servidor
-- ---------------------------------------------------------------------------
-- O grant veio de PUBLIC: revogar so de anon/authenticated nao faz nada.
grant execute on function public.get_forum_posts_comment_summary(uuid[], integer) to service_role;
grant execute on function public.get_forum_posts_saved_counts(uuid[]) to service_role;
revoke execute on function public.get_forum_posts_comment_summary(uuid[], integer) from public, anon, authenticated;
revoke execute on function public.get_forum_posts_saved_counts(uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Storage
-- ---------------------------------------------------------------------------
drop policy if exists "Public read access"         on storage.objects;
drop policy if exists "Support images read access" on storage.objects;

-- ---------------------------------------------------------------------------
-- 6. Privilegio default de tabela e sequence nova em public
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
