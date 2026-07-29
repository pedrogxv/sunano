-- anonymize_user_data zerava customer_email/customer_name em store_orders na
-- exclusão de conta, mas deixava metadata->>'user_id' intacto — o pedido
-- continuava referenciando o UUID do usuário para sempre (pseudonimização,
-- não anonimização). Recria a função também removendo essa chave do
-- metadata, mantendo o restante do jsonb (não há outras chaves hoje, mas
-- `- 'user_id'` é seguro mesmo se surgirem).
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
      customer_name  = null,
      metadata        = metadata - 'user_id'
  where metadata->>'user_id' = p_user_id::text;
end;
$$;

revoke execute on function anonymize_user_data(uuid) from public, anon, authenticated;
grant execute on function anonymize_user_data(uuid) to service_role;
