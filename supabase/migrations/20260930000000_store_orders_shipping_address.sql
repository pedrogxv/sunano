-- Endereço de ENTREGA do pedido.
--
-- Snapshot congelado no pedido (não referência ao perfil): o cliente pode
-- mudar de endereço depois, e um pedido já despachado precisa continuar
-- registrando para onde ele foi de fato. Mesmo princípio de
-- `store_orders.items` (snapshot de preço/nome) e de `pix_price_cents`.
--
-- Distinto do endereço de COBRANÇA que já existe em `user_profiles`
-- (postal_code/street/... exigidos pela Asaas para criar o customer no
-- checkout de cartão): entrega e cobrança podem divergir, e a Asaas só
-- guarda um endereço por customer — então a fonte de verdade da entrega é
-- esta tabela, nunca o gateway.
--
-- Nullable por ora (endereço opcional no checkout). Quando virar
-- obrigatório, o gate fica na aplicação (SHIPPING_ADDRESS_REQUIRED) — não
-- se adiciona NOT NULL aqui sem antes preencher o histórico.
alter table public.store_orders
  add column if not exists shipping_recipient text,
  add column if not exists shipping_phone text,
  add column if not exists shipping_postal_code text,
  add column if not exists shipping_street text,
  add column if not exists shipping_number text,
  add column if not exists shipping_complement text,
  add column if not exists shipping_neighborhood text,
  add column if not exists shipping_city text,
  add column if not exists shipping_state text,
  -- Quem preencheu e quando: o endereço pode chegar no checkout ou depois do
  -- pagamento (status awaiting_shipping_info), e o admin precisa saber se o
  -- que está na tela já é o definitivo.
  add column if not exists shipping_address_filled_at timestamptz;

-- Fila operacional do admin: "pagos que ainda não têm endereço". Sem o
-- índice parcial isso é um seq scan na tabela inteira de pedidos.
create index if not exists store_orders_missing_shipping_idx
  on public.store_orders (created_at desc)
  where shipping_address_filled_at is null
    and status in ('paid', 'awaiting_shipping_info');

-- Produto que não precisa de envio (futuro: item digital/serviço). Hoje
-- tudo na loja é físico, então o default true mantém o comportamento atual;
-- a existência da coluna é o que permite o checkout decidir se pede
-- endereço em vez de assumir "sempre".
alter table public.store_products
  add column if not exists requires_shipping boolean not null default true;

-- Anonimização LGPD: endereço de entrega é PII de contato e precisa sumir
-- junto com nome/e-mail na exclusão de conta. Recria a função de
-- 20260801_order_metadata_anonymization.sql acrescentando os campos novos —
-- o restante do corpo é idêntico.
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
  set customer_email          = null,
      customer_name           = null,
      shipping_recipient      = null,
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
end;
$$;

revoke execute on function anonymize_user_data(uuid) from public, anon, authenticated;
grant execute on function anonymize_user_data(uuid) to service_role;
