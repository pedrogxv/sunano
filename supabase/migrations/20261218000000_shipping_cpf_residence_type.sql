-- CPF de quem RECEBE e tipo de residência (casa/apartamento) no endereço de
-- entrega.
--
-- A importação passou a exigir, do destinatário: nome completo, endereço
-- completo (com CEP e se é casa ou apartamento), CPF do mesmo nome, celular e
-- data de nascimento do mesmo CPF. Nome, endereço, celular e nascimento já
-- existiam; faltavam o CPF e o tipo de residência.
--
-- O CPF aqui é de quem RECEBE, não o da cobrança (`user_profiles.cpf`): a
-- compra pode ser no cartão do pai e a entrega no nome do filho, e a
-- alfândega confere o CPF contra o nome e o nascimento do destinatário. Por
-- isso mora nas colunas `shipping_*`, como `shipping_birth_date`.
--
-- Mesmo par de colunas das outras de entrega:
-- - `store_orders.shipping_*`: snapshot do pedido, é o que vale para despachar;
-- - `user_profiles.shipping_*`: última entrega usada, só para pré-preencher.
--
-- Nullable: pedido gravado antes destes campos continua com endereço válido.
-- A obrigatoriedade para endereço NOVO fica na aplicação
-- (`shippingAddressSchema`), igual ao resto do endereço.
alter table public.store_orders
  add column if not exists shipping_cpf text,
  add column if not exists shipping_residence_type text;

alter table public.user_profiles
  add column if not exists shipping_cpf text,
  add column if not exists shipping_residence_type text;

alter table public.store_orders
  drop constraint if exists store_orders_shipping_residence_type_check;
alter table public.store_orders
  add constraint store_orders_shipping_residence_type_check
  check (shipping_residence_type is null or shipping_residence_type in ('house', 'apartment'));

alter table public.user_profiles
  drop constraint if exists user_profiles_shipping_residence_type_check;
alter table public.user_profiles
  add constraint user_profiles_shipping_residence_type_check
  check (shipping_residence_type is null or shipping_residence_type in ('house', 'apartment'));

-- Anonimização LGPD: CPF é PII e precisa sumir junto com o resto do endereço
-- de entrega na exclusão de conta. Mesma função de 20261205000000, com as duas
-- colunas novas; nada mais muda.
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
      shipping_cpf            = null,
      shipping_birth_date     = null,
      shipping_residence_type = null,
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
