-- Remove `author_email` de forum_posts/forum_comments.
--
-- Sobra do schema anterior a forum_v2 (quando posts ainda não tinham
-- user_id): nenhum código atual lê ou escreve essa coluna — o repositório
-- em lib/server/repositories/forum-repository.ts sempre faz select
-- explícito de colunas e nunca inclui author_email, tanto na leitura
-- pública quanto na moderação. Mantê-la seria reter e-mail sem finalidade
-- ativa, na contramão do princípio da minimização (LGPD Art. 6, III).

alter table public.forum_posts drop column if exists author_email;
alter table public.forum_comments drop column if exists author_email;

-- anonymize_user_data (20260613_lgpd_compliance.sql) zerava essa coluna no
-- exercício do direito de apagamento — precisa ser recriada sem essa
-- referência, senão a função passa a falhar (coluna inexistente).
create or replace function anonymize_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update forum_posts
  set author_name = '[usuário removido]'
  where user_id = p_user_id;

  update forum_comments
  set author_name = '[usuário removido]'
  where user_id = p_user_id;

  update store_orders
  set customer_email = null,
      customer_name  = null
  where metadata->>'user_id' = p_user_id::text;
end;
$$;

revoke execute on function anonymize_user_data(uuid) from public, anon, authenticated;
grant execute on function anonymize_user_data(uuid) to service_role;
