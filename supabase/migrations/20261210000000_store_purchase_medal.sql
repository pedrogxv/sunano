-- Conquista "CLIENTE SUNANO": card de medalha para quem COMPROU na Loja.
--
-- Critério novo de evento, `store_purchase`: ninguém ganha sozinho, a pessoa
-- RESGATA em /conquistas, e só consegue se tiver um pedido pago de verdade. O
-- card é pessoal: ele mostra o produto daquele pedido (nome + foto), então
-- cada dono tem uma carta diferente da do vizinho.
--
-- O ponto central é o comprar-e-cancelar. A posse NÃO é permanente como nas
-- outras medalhas: ela vale enquanto existir um pedido válido por trás. Quando
-- o pedido sai do estado pago (cancelado, estornado, expirado, chargeback que
-- vira `refunded`), um trigger em `store_orders` revê a posse:
--   - sobrou outro pedido válido  -> o card passa a mostrar esse outro produto;
--   - não sobrou nenhum           -> a medalha é removida do perfil.
-- Em TRIGGER, não na rota, pelo mesmo motivo do aviso de pedido pago
-- (20261209000000): são vários caminhos que mudam status de pedido (estorno do
-- admin, webhook da Asaas, cron de expiração, `syncOrderRefundState`), e o que
-- ficasse de fora deixaria o card com quem devolveu o produto.
--
-- O vínculo pedido -> medalha mora em `user_medal_purchases`, tabela PRIVADA.
-- `user_medals` é leitura pública (vitrine de perfil), e o id do pedido não
-- tem por que sair na REST. A existência da linha também é a marca de "esta
-- medalha depende de compra": se o admin apagar o evento, a revogação continua
-- funcionando, porque ela olha a linha, não o evento.

-- ────────────────────────────────────────────
-- 1. Critério novo
-- ────────────────────────────────────────────
alter table public.events drop constraint if exists events_criteria_type_check;
alter table public.events add constraint events_criteria_type_check
  check (criteria_type in ('first_n_signups', 'manual_opt_in', 'aura_redeem', 'staff_grant', 'store_purchase'));

-- ────────────────────────────────────────────
-- 2. Vínculo privado medalha -> pedido (+ snapshot do produto exibido)
-- ────────────────────────────────────────────
-- `order_id` SEM foreign key de propósito: se o pedido for apagado, a linha
-- continua existindo, o sync não acha pedido válido e remove a medalha. Com
-- `on delete set null`/`cascade` o apagão levaria junto a própria marca de
-- que a medalha dependia de compra.
create table if not exists public.user_medal_purchases (
  user_id           uuid not null,
  medal_id          uuid not null,
  order_id          uuid not null,
  product_name      text,
  product_image_url text,
  updated_at        timestamptz not null default now(),
  primary key (user_id, medal_id),
  foreign key (user_id, medal_id) references public.user_medals (user_id, medal_id) on delete cascade
);

alter table public.user_medal_purchases enable row level security;
revoke all on public.user_medal_purchases from anon, authenticated;
-- Sem policy: só o service_role (repositório + funções abaixo) lê e escreve.

-- ────────────────────────────────────────────
-- 3. Dono do pedido e "o que conta como compra"
-- ────────────────────────────────────────────
-- O dono vive em `metadata->>'user_id'` (é o que `orderOwnerId` lê no TS); a
-- coluna `user_id` fica de reserva. O regex evita que um metadata malformado
-- derrube o UPDATE do pedido com erro de cast dentro do trigger.
create or replace function public.store_order_owner_id(p_metadata jsonb, p_user_id uuid)
returns uuid
language sql
immutable
set search_path = public
as $$
  select coalesce(
    case
      when p_metadata->>'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (p_metadata->>'user_id')::uuid
    end,
    p_user_id
  )
$$;

revoke execute on function public.store_order_owner_id(jsonb, uuid) from public, anon, authenticated;

-- Primeira compra válida do usuário e o produto que o card exibe (o item mais
-- caro do pedido: é o "produto da compra", não o frete ou um acessório).
--
-- Compra válida = dinheiro de verdade que ficou com a loja:
--   - status pago (inclui as etapas de envio);
--   - fora do sandbox (pagamento de mentira);
--   - não é resgate da Central de Aura (`payment_method = 'aura'`, total 0);
--   - não foi estornada por inteiro (estorno parcial mantém o pedido pago).
create or replace function public.first_valid_store_purchase(p_user_id uuid)
returns table (order_id uuid, product_name text, product_image_url text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id,
         it.item->>'name',
         nullif(it.item->>'image', '')
  from public.store_orders o
  left join lateral (
    select i as item
    from jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) i
    order by coalesce((i->>'price_cents')::numeric, 0) desc
    limit 1
  ) it on true
  where public.store_order_owner_id(o.metadata, o.user_id) = p_user_id
    and o.status in ('paid', 'awaiting_shipping_info', 'shipped', 'delivered')
    and o.is_sandbox is not true
    and o.payment_method is distinct from 'aura'
    and o.aura_cost_paid is null
    and o.total_cents > 0
    and coalesce(o.refunded_cents, 0) < o.total_cents
  order by o.created_at asc
  limit 1
$$;

revoke execute on function public.first_valid_store_purchase(uuid) from public, anon, authenticated;
grant execute on function public.first_valid_store_purchase(uuid) to service_role;

-- ────────────────────────────────────────────
-- 4. Resgate
-- ────────────────────────────────────────────
-- Retorna texto porque há motivos distintos para não conceder e a tela diz
-- coisas diferentes para cada um:
--   'granted'     — concedeu agora
--   'already'     — já tinha
--   'no_purchase' — não tem pedido pago válido
--   'unavailable' — evento inexistente, encerrado, de outro critério ou lotado
--
-- A trava de corrida é o `for share` no pedido: se o admin estornar no mesmo
-- instante, o UPDATE do pedido espera este resgate terminar e o trigger dele
-- já enxerga a medalha para remover; se o estorno chegou antes, a releitura
-- depois do `for share` vê o status novo e o resgate é recusado.
--
-- Ordem das travas: PEDIDO antes do EVENTO. O trigger de revogação segura o
-- pedido (é o UPDATE dele) e depois mexe no contador do evento; se o resgate
-- travasse o evento primeiro, os dois podiam ficar esperando um pelo outro.
create or replace function public.claim_store_purchase_medal(p_event_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_medal_id  uuid;
  v_max       integer;
  v_count     integer;
  v_order_id  uuid;
  v_name      text;
  v_image     text;
  v_inserted  integer;
begin
  select f.order_id into v_order_id
  from public.first_valid_store_purchase(p_user_id) f;

  if v_order_id is null then
    return 'no_purchase';
  end if;

  perform 1 from public.store_orders where id = v_order_id for share;

  -- Relê depois da trava: entre a busca e o `for share` o pedido pode ter
  -- sido estornado por outra transação.
  select f.order_id, f.product_name, f.product_image_url
    into v_order_id, v_name, v_image
  from public.first_valid_store_purchase(p_user_id) f;

  if v_order_id is null then
    return 'no_purchase';
  end if;

  select medal_id, max_participants, current_count
    into v_medal_id, v_max, v_count
  from public.events
  where id = p_event_id and active = true and criteria_type = 'store_purchase'
  for update;

  if not found then
    return 'unavailable';
  end if;

  if exists (select 1 from public.user_medals where user_id = p_user_id and medal_id = v_medal_id) then
    return 'already';
  end if;

  if v_max is not null and v_count >= v_max then
    return 'unavailable';
  end if;

  insert into public.user_medals (user_id, medal_id)
  values (p_user_id, v_medal_id)
  on conflict (user_id, medal_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 'already';
  end if;

  insert into public.user_medal_purchases (user_id, medal_id, order_id, product_name, product_image_url)
  values (p_user_id, v_medal_id, v_order_id, v_name, v_image);

  update public.events
  set current_count = current_count + 1,
      updated_at = now()
  where id = p_event_id;

  return 'granted';
end;
$$;

revoke execute on function public.claim_store_purchase_medal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_store_purchase_medal(uuid, uuid) to service_role;

-- ────────────────────────────────────────────
-- 5. Revisão da posse (chamada pelo trigger)
-- ────────────────────────────────────────────
create or replace function public.sync_store_purchase_medals(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_name     text;
  v_image    text;
  r          record;
begin
  if p_user_id is null
     or not exists (select 1 from public.user_medal_purchases where user_id = p_user_id) then
    return;
  end if;

  select f.order_id, f.product_name, f.product_image_url
    into v_order_id, v_name, v_image
  from public.first_valid_store_purchase(p_user_id) f;

  for r in
    select medal_id, order_id from public.user_medal_purchases where user_id = p_user_id
  loop
    if v_order_id is null then
      -- Cascade apaga a linha de `user_medal_purchases` junto.
      delete from public.user_medals where user_id = p_user_id and medal_id = r.medal_id;

      update public.events
      set current_count = greatest(current_count - 1, 0),
          updated_at = now()
      where medal_id = r.medal_id and criteria_type = 'store_purchase';
    elsif r.order_id is distinct from v_order_id then
      update public.user_medal_purchases
      set order_id = v_order_id,
          product_name = v_name,
          product_image_url = v_image,
          updated_at = now()
      where user_id = p_user_id and medal_id = r.medal_id;
    end if;
  end loop;
end;
$$;

revoke execute on function public.sync_store_purchase_medals(uuid) from public, anon, authenticated;

create or replace function public.trg_store_orders_purchase_medals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_owner uuid := public.store_order_owner_id(old.metadata, old.user_id);
  v_new_owner uuid;
begin
  perform public.sync_store_purchase_medals(v_old_owner);

  if tg_op = 'UPDATE' then
    v_new_owner := public.store_order_owner_id(new.metadata, new.user_id);
    if v_new_owner is distinct from v_old_owner then
      perform public.sync_store_purchase_medals(v_new_owner);
    end if;
  end if;

  return null;
end;
$$;

revoke execute on function public.trg_store_orders_purchase_medals() from public, anon, authenticated;

-- Só UPDATE/DELETE: um pedido novo nunca tira direito de ninguém. AFTER, para
-- enxergar o status final que o BEFORE de etapa de envio
-- (20261206000002) grava.
drop trigger if exists trg_store_orders_purchase_medals on public.store_orders;
create trigger trg_store_orders_purchase_medals
  after update of status, is_sandbox, refunded_cents, total_cents, payment_method, aura_cost_paid, metadata, user_id, items
    or delete
  on public.store_orders
  for each row execute function public.trg_store_orders_purchase_medals();

-- ────────────────────────────────────────────
-- 6. A conquista em si
-- ────────────────────────────────────────────
-- Arte padrão (a de quem ainda não resgatou) é um SVG em /public; para o dono,
-- o card troca a arte pela foto do produto comprado. O admin pode trocar nome,
-- descrição e imagem padrão em /admin/eventos como em qualquer conquista.
insert into public.medals (slug, name, description, icon_url, rarity, category)
values (
  'cliente-sunano',
  'CLIENTE SUNANO',
  'Card exclusivo de quem comprou na Loja Sunano. Ele mostra no seu perfil o produto que você levou. Se o pedido for cancelado ou estornado, o card sai junto.',
  '/images/medals/cliente-sunano.svg',
  'legendary',
  'event'
)
on conflict (slug) do nothing;

insert into public.events (slug, medal_id, criteria_type, max_participants, active, requires_vip, sort_order)
select 'cliente-sunano',
       m.id,
       'store_purchase',
       null,
       true,
       false,
       coalesce((select max(sort_order) from public.events), -1) + 1
from public.medals m
where m.slug = 'cliente-sunano'
  and not exists (select 1 from public.events where slug = 'cliente-sunano');
