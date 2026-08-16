-- Estende anonymize_user_data para zerar os dados de saque (PIX) do afiliado
-- correspondente ao usuário excluído, mesmo padrão de
-- 20260801_order_metadata_anonymization.sql.
--
-- Não zera `affiliate_commission_events` nem `store_orders.affiliate_id`/
-- `affiliate_code`: são registros financeiros (comissões geradas por/para
-- este afiliado) que precisam sobreviver à exclusão da conta, igual
-- `store_orders` de compras já feitas não é apagado — só a PII de contato é
-- removida. O afiliado em si fica `suspended` para não continuar gerando
-- comissão em vendas novas.
--
-- IMPORTANTE — aplicar manualmente via Supabase Dashboard (SQL Editor): o
-- histórico de migrations deste projeto está dessincronizado desde 04/08,
-- não rodar via `supabase db push`.

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

  update affiliates
  set pix_key      = null,
      pix_key_type = null,
      status       = 'suspended'
  where user_id = p_user_id and status != 'suspended';
end;
$$;

revoke execute on function anonymize_user_data(uuid) from public, anon, authenticated;
grant execute on function anonymize_user_data(uuid) to service_role;
