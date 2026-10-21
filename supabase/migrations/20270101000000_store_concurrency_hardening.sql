-- Loja sob carga: concorrência, atomicidade de estoque e rate limit.
--
-- Auditoria de 21/10/2026 ("milhares de pessoas comprando ao mesmo tempo").
-- Tudo aqui é ADITIVO: nenhuma função existente muda de assinatura, então o
-- código anterior continua funcionando com a migration aplicada, e o código
-- novo tem fallback para quando ela ainda não foi aplicada.
--
-- 1. `app_leases` + `acquire_lease`/`release_lease` — trava com prazo. O
--    checkout lê "quantos pedidos pendentes você tem" e grava o pedido muitos
--    round-trips depois: N requisições simultâneas da MESMA conta passavam
--    todas pelo teto de pendentes, pela trava de um pedido por produto e pelo
--    limite diário, e cada uma segurava estoque. Com a trava, a conta tem um
--    checkout em voo por vez. O mesmo vale para o estorno (dois cliques no
--    admin estornavam duas vezes na Asaas, que não tem idempotência).
--
-- 2. `consume_rate_limit` — o limiter contava e depois inseria, em duas idas.
--    Vinte requisições em paralelo liam a mesma contagem e passavam todas
--    (inclusive o teto de tentativas de cartão, a defesa contra teste de
--    cartão roubado). Agora conta e registra na mesma transação, serializado
--    por balde.
--
-- 3. `store_orders.user_id` — o checkout grava o dono só em `metadata`, e a
--    coluna (que o limite diário de produto sem estoque consulta) ficava nula:
--    58 de 61 pedidos com dono estavam assim, e o limite de 15 un/dia nunca
--    disparava. Trigger + backfill.
--
-- 4. `reserve_store_stock` — desconto do estoque E linha no diário de
--    reservas na mesma transação. Antes eram dois comandos: a Function que
--    morresse entre eles deixava estoque descontado sem diário, perdido.
--
-- 5. `release_stock_reservation_group` — devolve uma reserva inteira (diário
--    + estoque) de uma vez. Antes o checkout apagava o diário e depois
--    devolvia linha a linha: morrer no meio perdia as unidades.
--
-- 6. `release_pending_store_orders` — pending → expired/cancelled E a
--    devolução do estoque dos itens na MESMA transação. O cron marcava
--    `expired` num comando e devolvia o estoque em outros (um RPC por item):
--    com um lote grande, o timeout de 30 s no meio deixava pedidos expirados
--    com as unidades fora da prateleira para sempre.
--
-- 7. `store_products.max_per_customer` + `store_orders.payer_document_hash` —
--    limite de unidades por cliente (conta OU CPF do pagador) em lançamento
--    disputado: o cambista multiplica contas, não CPFs válidos.

-- ────────────────────────────────────────────
-- 1. Trava com prazo (lease)
-- ────────────────────────────────────────────
create table if not exists public.app_leases (
  key text primary key,
  owner uuid not null,
  expires_at timestamptz not null
);

-- Só o service role (rotas do Next) usa. Sem policy: RLS ligada nega o resto.
alter table public.app_leases enable row level security;
revoke all on table public.app_leases from anon, authenticated;

comment on table public.app_leases is
  'Travas com prazo (checkout por conta, estorno por pedido). Ver acquire_lease.';

-- Pega a trava `p_key` para `p_owner` por `p_ttl_seconds`. Devolve false se
-- outra pessoa a segura e ela ainda não venceu. O prazo é a rede de segurança:
-- se a Function morrer sem soltar, a trava vence sozinha.
--
-- O `on conflict ... where` resolve a corrida no índice único: entre dois
-- pedidos simultâneos pela mesma chave, só um insere ou renova; o outro
-- reavalia o WHERE sobre a linha já gravada e não devolve nada.
create or replace function public.acquire_lease(
  p_key text,
  p_owner uuid,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acquired boolean;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200
     or p_owner is null
     or p_ttl_seconds is null or p_ttl_seconds < 1 or p_ttl_seconds > 900 then
    raise exception 'acquire_lease: parâmetros inválidos';
  end if;

  insert into public.app_leases as l (key, owner, expires_at)
  values (p_key, p_owner, now() + make_interval(secs => p_ttl_seconds))
  on conflict (key) do update
    set owner = excluded.owner,
        expires_at = excluded.expires_at
    where l.expires_at <= now()
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

revoke execute on function public.acquire_lease(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.acquire_lease(text, uuid, integer) to service_role;

-- Solta a trava, só se ainda for de quem a pegou (uma trava vencida e
-- renovada por outra requisição não pode ser solta pela primeira).
create or replace function public.release_lease(p_key text, p_owner uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released boolean;
begin
  delete from public.app_leases
  where key = p_key and owner = p_owner
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

revoke execute on function public.release_lease(text, uuid) from public, anon, authenticated;
grant execute on function public.release_lease(text, uuid) to service_role;

-- ────────────────────────────────────────────
-- 2. Rate limit atômico
-- ────────────────────────────────────────────
-- Conta e registra a tentativa na MESMA transação, com o balde (ação +
-- identificador) serializado por advisory lock. É o mesmo padrão de
-- `reserve_preorder`: o lock só segura requisições do mesmo balde, e a
-- contagem (comando seguinte, snapshot novo) já enxerga a tentativa que a
-- transação anterior acabou de gravar.
create or replace function public.consume_rate_limit(
  p_action text,
  p_identifier text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
  v_count integer;
  v_oldest timestamptz;
  v_id uuid;
begin
  if p_action is null or length(p_action) = 0
     or p_identifier is null or length(p_identifier) = 0
     or p_max_attempts is null or p_max_attempts < 1
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'consume_rate_limit: parâmetros inválidos';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_action || chr(31) || p_identifier, 0));

  v_since := clock_timestamp() - make_interval(secs => p_window_seconds);

  select count(*), min(created_at)
    into v_count, v_oldest
  from public.rate_limit_events
  where action = p_action
    and identifier = p_identifier
    and created_at >= v_since;

  if v_count >= p_max_attempts then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds',
      greatest(
        1,
        ceil(extract(epoch from (v_oldest + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer
      )
    );
  end if;

  insert into public.rate_limit_events (action, identifier, created_at)
  values (p_action, p_identifier, clock_timestamp())
  returning id into v_id;

  return jsonb_build_object('allowed', true, 'attempt_id', v_id);
end;
$$;

revoke execute on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;

-- ────────────────────────────────────────────
-- 3. store_orders.user_id sempre preenchido
-- ────────────────────────────────────────────
-- O checkout grava o dono em `metadata.user_id`; a coluna vem daqui. Só
-- preenche (nunca sobrescreve) e só com um usuário que existe: a FK
-- (`on delete set null`) recusaria um id de conta já apagada, e o insert do
-- pedido cairia junto.
create or replace function public.trg_store_orders_sync_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if new.user_id is null
     and new.metadata->>'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_owner := (new.metadata->>'user_id')::uuid;
    if exists (select 1 from auth.users u where u.id = v_owner) then
      new.user_id := v_owner;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_store_orders_sync_user_id() from public, anon, authenticated;

drop trigger if exists trg_store_orders_sync_user_id on public.store_orders;
create trigger trg_store_orders_sync_user_id
  before insert or update of metadata, user_id on public.store_orders
  for each row execute function public.trg_store_orders_sync_user_id();

-- Backfill. Dispara `trg_store_orders_purchase_medals` (UPDATE OF user_id),
-- que é um recálculo idempotente e deriva o dono do próprio `metadata`: não
-- concede nem tira nada que já não fosse do mesmo dono.
update public.store_orders o
set user_id = (o.metadata->>'user_id')::uuid
where o.user_id is null
  and o.metadata->>'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1 from auth.users u
    where u.id::text = lower(o.metadata->>'user_id')
  );

-- ────────────────────────────────────────────
-- 4/5/6. Estoque: reservar, devolver reserva, devolver pedido
-- ────────────────────────────────────────────

-- Devolve unidades a quem as cedeu: a combinação (SKU), a cor (variante) ou o
-- produto — a mesma ordem de `restoreStock` (orders-repository.ts). Estoque
-- nulo (sem controle) continua nulo.
--
-- `p_skip_preorder`: a linha do DIÁRIO de uma pré-venda não diz de onde
-- veio (nunca descontou estoque), então quem lê o diário pula produto que é
-- pré-venda, igual a `release_orphaned_stock_reservations`. Quem lê o ITEM
-- do pedido já filtrou pelo snapshot `sale_type` e passa false.
create or replace function public.store_restore_stock_line(
  p_product_id uuid,
  p_variant_id uuid,
  p_sku_id uuid,
  p_quantity integer,
  p_skip_preorder boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_quantity is null or p_quantity < 1 then
    return;
  end if;

  if p_sku_id is not null then
    update public.store_product_skus
    set stock = case when stock is null then null else stock + p_quantity end,
        updated_at = now()
    where id = p_sku_id;
  elsif p_variant_id is not null then
    update public.store_product_variants
    set stock = case when stock is null then null else stock + p_quantity end,
        updated_at = now()
    where id = p_variant_id;
  else
    update public.store_products
    set stock = case when stock is null then null else stock + p_quantity end,
        updated_at = now()
    where id = p_product_id
      and (not p_skip_preorder or sale_type <> 'pre_order');
  end if;
end;
$$;

revoke execute on function public.store_restore_stock_line(uuid, uuid, uuid, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.store_restore_stock_line(uuid, uuid, uuid, integer, boolean)
  to service_role;

-- Reserva de estoque físico do checkout: desconta de onde o estoque é
-- controlado (SKU, senão cor, senão produto) e grava a linha no diário na
-- mesma transação. Devolve `{ok, remaining}`: `remaining` nulo = sem controle
-- de estoque; o checkout usa o número para invalidar a página do produto.
--
-- Confere que a cor/combinação é do produto informado: o checkout já valida,
-- mas o banco não confiar no chamador é o que impede um id trocado de
-- descontar o estoque de outro produto.
create or replace function public.reserve_store_stock(
  p_reservation_group uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_sku_id uuid,
  p_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean := false;
  v_remaining integer;
begin
  if p_reservation_group is null or p_product_id is null
     or p_quantity is null or p_quantity < 1 then
    raise exception 'reserve_store_stock: parâmetros inválidos';
  end if;

  if p_sku_id is not null then
    update public.store_product_skus
    set stock = case when stock is null then null else stock - p_quantity end,
        updated_at = now()
    where id = p_sku_id
      and product_id = p_product_id
      and (stock is null or stock >= p_quantity)
    returning true, stock into v_found, v_remaining;
  elsif p_variant_id is not null then
    update public.store_product_variants
    set stock = case when stock is null then null else stock - p_quantity end,
        updated_at = now()
    where id = p_variant_id
      and product_id = p_product_id
      and (stock is null or stock >= p_quantity)
    returning true, stock into v_found, v_remaining;
  else
    update public.store_products
    set stock = case when stock is null then null else stock - p_quantity end,
        updated_at = now()
    where id = p_product_id
      and sale_type <> 'pre_order'
      and (stock is null or stock >= p_quantity)
    returning true, stock into v_found, v_remaining;
  end if;

  if not coalesce(v_found, false) then
    return jsonb_build_object('ok', false);
  end if;

  insert into public.store_stock_reservations
    (reservation_group, product_id, variant_id, sku_id, quantity)
  values
    (p_reservation_group, p_product_id, p_variant_id, p_sku_id, p_quantity);

  return jsonb_build_object('ok', true, 'remaining', v_remaining);
end;
$$;

revoke execute on function public.reserve_store_stock(uuid, uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_store_stock(uuid, uuid, uuid, uuid, integer)
  to service_role;

-- Desfaz uma reserva inteira do checkout (diário + estoque) atomicamente.
-- Inclui as linhas de pré-venda (`reserve_preorder`), que só saem do diário.
create or replace function public.release_stock_reservation_group(p_reservation_group uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released integer := 0;
  v_row record;
begin
  for v_row in
    delete from public.store_stock_reservations
    where reservation_group = p_reservation_group
    returning product_id, variant_id, sku_id, quantity
  loop
    perform public.store_restore_stock_line(
      v_row.product_id, v_row.variant_id, v_row.sku_id, v_row.quantity, true
    );
    v_released := v_released + 1;
  end loop;

  return v_released;
end;
$$;

revoke execute on function public.release_stock_reservation_group(uuid)
  from public, anon, authenticated;
grant execute on function public.release_stock_reservation_group(uuid) to service_role;

-- Tira pedidos de `pending` (para `expired` ou `cancelled`) e devolve o
-- estoque dos itens na mesma transação. Só age sobre o que AINDA está
-- pendente no momento da escrita: um pedido pago por um webhook concorrente
-- fica de fora, e nada dele volta à prateleira.
--
-- O item do pedido diz de onde a unidade saiu (snapshot do checkout):
-- `sale_type = 'pre_order'` não descontou nada; `sku_stock` = saiu da
-- combinação; senão da cor (`variant_id`), senão do produto (`id`). Mesma
-- regra de `orderLineStockMovement` + `lineMovesPhysicalStock`.
--
-- Item malformado é pulado, não derruba o lote: um pedido antigo com JSON
-- estranho não pode travar a expiração de todos os outros.
create or replace function public.release_pending_store_orders(
  p_order_ids uuid[],
  p_to_status text
)
returns table (
  order_id uuid,
  order_metadata jsonb,
  order_items jsonb,
  order_asaas_payment_id text,
  order_asaas_checkout_id text,
  order_stripe_payment_intent_id text,
  order_payment_gateway text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item jsonb;
  v_quantity integer;
  v_uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if p_to_status not in ('expired', 'cancelled') then
    raise exception 'release_pending_store_orders: status inválido %', p_to_status;
  end if;
  if p_order_ids is null or cardinality(p_order_ids) = 0 then
    return;
  end if;

  for v_order in
    update public.store_orders o
    set status = p_to_status,
        updated_at = now()
    where o.id = any(p_order_ids)
      and o.status = 'pending'
    returning o.id, o.metadata, o.items, o.asaas_payment_id, o.asaas_checkout_id,
              o.stripe_payment_intent_id, o.payment_gateway
  loop
    if jsonb_typeof(v_order.items) = 'array' then
      for v_item in select value from jsonb_array_elements(v_order.items)
      loop
        continue when jsonb_typeof(v_item) <> 'object';
        continue when coalesce(v_item->>'sale_type', '') = 'pre_order';
        continue when coalesce(v_item->>'id', '') !~* v_uuid_re;
        continue when coalesce(v_item->>'quantity', '') !~ '^[0-9]{1,6}$';
        v_quantity := (v_item->>'quantity')::integer;

        perform public.store_restore_stock_line(
          (v_item->>'id')::uuid,
          case when coalesce(v_item->>'variant_id', '') ~* v_uuid_re
               then (v_item->>'variant_id')::uuid end,
          case when v_item->>'sku_stock' = 'true'
                and coalesce(v_item->>'sku_id', '') ~* v_uuid_re
               then (v_item->>'sku_id')::uuid end,
          v_quantity,
          false
        );
      end loop;
    end if;

    order_id := v_order.id;
    order_metadata := v_order.metadata;
    order_items := v_order.items;
    order_asaas_payment_id := v_order.asaas_payment_id;
    order_asaas_checkout_id := v_order.asaas_checkout_id;
    order_stripe_payment_intent_id := v_order.stripe_payment_intent_id;
    order_payment_gateway := v_order.payment_gateway;
    return next;
  end loop;
end;
$$;

revoke execute on function public.release_pending_store_orders(uuid[], text)
  from public, anon, authenticated;
grant execute on function public.release_pending_store_orders(uuid[], text) to service_role;

-- Fila do cron de expiração: pedidos pendentes com prazo vencido, mais
-- antigos primeiro. O índice parcial deixa a varredura proporcional aos
-- pendentes, não à tabela inteira de pedidos.
create index if not exists store_orders_pending_expiry_idx
  on public.store_orders (pix_expires_at, created_at)
  where status = 'pending';

-- ────────────────────────────────────────────
-- 7. Limite de unidades por CLIENTE (lançamento disputado)
-- ────────────────────────────────────────────
-- Os limites por conta (trava, teto de pendentes) não pegam o cambista com
-- várias contas: cada uma é um navegador de verdade. O que ele não multiplica
-- é CPF válido, que o checkout exige para emitir a cobrança. `max_per_customer`
-- é o teto do produto por cliente = mesma conta OU mesmo CPF de pagador.
alter table public.store_products
  add column if not exists max_per_customer integer
  check (max_per_customer is null or max_per_customer >= 1);

comment on column public.store_products.max_per_customer is
  'Teto de unidades por cliente (conta ou CPF do pagador), somando pedidos não cancelados. null = sem limite.';

-- Impressão digital do CPF do pagador (HMAC calculado no servidor, nunca o
-- CPF em claro): é o que liga pedidos de contas diferentes à mesma pessoa
-- sem gravar mais um documento em texto puro.
alter table public.store_orders
  add column if not exists payer_document_hash text;

create index if not exists store_orders_payer_document_hash_idx
  on public.store_orders (payer_document_hash)
  where payer_document_hash is not null;

-- Quanto o cliente já tem de cada produto: pedidos da conta OU do CPF, em
-- qualquer status que ainda segura ou já levou o produto (pendente conta: é
-- justamente o que um cambista acumula). Mesmo ambiente do gateway.
create or replace function public.store_customer_product_quantities(
  p_product_ids uuid[],
  p_user_id uuid,
  p_payer_document_hash text,
  p_is_sandbox boolean
)
returns table (product_id uuid, quantity integer)
language sql
stable
security definer
set search_path = public
as $$
  select (item->>'id')::uuid, sum((item->>'quantity')::integer)::integer
  from public.store_orders o
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end
  ) as item
  where o.status in ('pending', 'paid', 'awaiting_shipping_info', 'shipped', 'delivered')
    and o.is_sandbox = p_is_sandbox
    and (
      o.user_id = p_user_id
      or o.metadata->>'user_id' = p_user_id::text
      or (p_payer_document_hash is not null and o.payer_document_hash = p_payer_document_hash)
    )
    and item->>'id' = any(select unnest(p_product_ids)::text)
    and coalesce(item->>'quantity', '') ~ '^[0-9]{1,6}$'
  group by 1
$$;

revoke execute on function public.store_customer_product_quantities(uuid[], uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.store_customer_product_quantities(uuid[], uuid, text, boolean)
  to service_role;

-- Anonimização LGPD: a impressão digital do CPF também sai na exclusão de
-- conta. Mesma função de 20261218000000, com a coluna nova; nada mais muda.
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
      payer_document_hash     = null,
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
