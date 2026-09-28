-- Data de nascimento de quem RECEBE, no endereço de entrega.
--
-- A alfândega passou a exigir a data de nascimento do destinatário para
-- liberar produto importado. Ela é de quem recebe, não de quem paga (a
-- cobrança pode ser no cartão do pai e a entrega no nome do filho), então
-- mora junto das colunas `shipping_*`, nunca junto do CPF da cobrança.
--
-- Mesmo par de colunas das outras de entrega:
-- - `store_orders.shipping_birth_date`: snapshot do pedido, é o que vale
--   para despachar;
-- - `user_profiles.shipping_birth_date`: última entrega usada, só para
--   pré-preencher a próxima compra.
--
-- Nullable: pedido gravado antes deste campo continua com endereço válido
-- para despachar. A obrigatoriedade para endereço NOVO fica na aplicação
-- (`shippingAddressSchema`), igual ao resto do endereço.
alter table public.store_orders
  add column if not exists shipping_birth_date date;

alter table public.user_profiles
  add column if not exists shipping_birth_date date;

-- Anonimização LGPD: data de nascimento é PII e precisa sumir junto com o
-- resto do endereço de entrega na exclusão de conta.
--
-- Recria a função juntando as duas versões anteriores. A de
-- 20260930000030_store_orders_shipping_address.sql partiu da de
-- 20260801 e, sem querer, apagou o trecho de afiliados que
-- 20260921000003_affiliates_lgpd_anonymization.sql tinha acrescentado
-- (conferido em produção em 28/09/2026: a função viva não tocava em
-- `affiliates`). O trecho volta aqui.
--
-- `set search_path` explícito: `create or replace` substitui a configuração
-- que 20261105000000 anexou por ALTER FUNCTION.
create or replace function public.anonymize_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update forum_posts
  set author_name = '[usuário removido]'
  where user_id = p_user_id;

  update forum_comments
  set author_name = '[usuário removido]'
  where user_id = p_user_id;

  update store_orders
  set customer_email          = null,
      customer_name           = null,
      shipping_recipient      = null,
      shipping_birth_date     = null,
      shipping_phone          = null,
      shipping_postal_code    = null,
      shipping_street         = null,
      shipping_number         = null,
      shipping_complement     = null,
      shipping_neighborhood   = null,
      shipping_city           = null,
      shipping_state          = null,
      metadata                = metadata - 'user_id'
  where metadata->>'user_id' = p_user_id::text;

  update affiliates
  set pix_key      = null,
      pix_key_type = null,
      status       = 'suspended'
  where user_id = p_user_id and status != 'suspended';
end;
$$;

revoke execute on function public.anonymize_user_data(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_user_data(uuid) to service_role;
