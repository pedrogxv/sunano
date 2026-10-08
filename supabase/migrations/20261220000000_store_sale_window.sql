-- Prazo único de pré-venda e Lançamento.
--
-- Substitui as duas réguas que existiam:
--   * pré-venda: preorder_early_ends_at (fim do desconto) + preorder_ends_at
--     (7 dias depois, vira normal), da 20261215000000;
--   * lançamento: launch_until (data, sem hora, sem contagem e sem mexer em
--     preço), da 20261213000001.
--
-- Agora as duas são a mesma coisa: o produto fica em pré-venda/lançamento
-- até `sale_window_ends_at` (a loja mostra a contagem) e, nesse instante, vira
-- produto normal. O que acontece com o preço é escolha do admin:
--   keep       mantém o preço de agora
--   end_promo  apaga a promoção (sobe para o preço cheio)
--   set_price  passa a cobrar `sale_window_end_price_cents`
--
-- Quem fecha o prazo é `close_store_sale_windows`, chamada pelo cron
-- /api/cron/sale-windows. Fica no banco porque mexe em produto, variantes e
-- combinações juntos. O preço cobrado sai sempre de promo_price_cents ?? price,
-- então mudar essas colunas É mudar o preço em vitrine, página, carrinho e
-- checkout ao mesmo tempo.
--
-- Sem prazo (`sale_window_ends_at` nulo) o produto se comporta como antes:
-- pré-venda/lançamento até o admin desmarcar.

alter table public.store_products
  add column if not exists sale_window_ends_at timestamptz,
  add column if not exists sale_window_end_action text not null default 'keep',
  add column if not exists sale_window_end_price_cents integer;

alter table public.store_products
  drop constraint if exists store_products_sale_window_end_action_check;
alter table public.store_products
  add constraint store_products_sale_window_end_action_check
  check (sale_window_end_action in ('keep', 'end_promo', 'set_price'));

alter table public.store_products
  drop constraint if exists store_products_sale_window_end_price_check;
alter table public.store_products
  add constraint store_products_sale_window_end_price_check
  check (
    (sale_window_end_action = 'set_price') = (sale_window_end_price_cents is not null)
    and (sale_window_end_price_cents is null or sale_window_end_price_cents >= 600)
  );

comment on column public.store_products.sale_window_ends_at is
  'Fim da pré-venda/lançamento. A loja mostra a contagem; passada a data, o cron (close_store_sale_windows) vira o produto normal. Nulo = sem prazo.';
comment on column public.store_products.sale_window_end_action is
  'O que acontece com o preço no fim do prazo: keep | end_promo | set_price.';
comment on column public.store_products.sale_window_end_price_cents is
  'Preço (PIX) depois do prazo, só com sale_window_end_action = set_price.';

-- Cópia das réguas antigas, só enquanto as colunas existem (a migration
-- pode rodar de novo depois de apagá-las).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'store_products' and column_name = 'launch_until'
  ) then
    -- Lançamento com data de saída vira prazo com hora: fim do último dia,
    -- em Brasília (a mesma régua de todayKeySaoPaulo).
    update public.store_products
    set sale_window_ends_at = ((launch_until + 1)::timestamp at time zone 'America/Sao_Paulo')
    where is_launch and launch_until is not null and sale_window_ends_at is null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'store_products' and column_name = 'preorder_early_ends_at'
  ) then
    -- Pré-venda com o prazo antigo: o fim da pré-venda é o prazo novo, e o
    -- desconto acaba junto (era o que a fase 1 fazia).
    update public.store_products
    set sale_window_ends_at = coalesce(preorder_ends_at, preorder_early_ends_at),
        sale_window_end_action = 'end_promo'
    where sale_type = 'pre_order' and preorder_early_ends_at is not null and sale_window_ends_at is null;
  end if;
end $$;

-- As colunas antigas (preorder_early_ends_at, preorder_ends_at, launch_until)
-- e `advance_preorder_phases` ficam paradas: o código no ar antes do deploy
-- ainda as lê, e apagá-las aqui derrubaria a seção de lançamentos entre a
-- migration e o deploy. Saem numa migration de limpeza depois do deploy.

create or replace function public.close_store_sale_windows()
returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_ids
  from public.store_products
  where sale_window_ends_at <= now()
    and (sale_type = 'pre_order' or is_launch);

  if cardinality(v_ids) > 0 then
    -- 1) Preço. Promoção das variantes e combinações sai junto em qualquer
    --    mudança: elas ganham da do produto, e sobrariam cobrando o preço
    --    da pré-venda depois do fim.
    update public.store_product_variants v set promo_price_cents = null
    from public.store_products p
    where v.product_id = p.id and p.id = any(v_ids)
      and p.sale_window_end_action in ('end_promo', 'set_price')
      and v.promo_price_cents is not null;

    update public.store_product_skus s set promo_price_cents = null
    from public.store_products p
    where s.product_id = p.id and p.id = any(v_ids)
      and p.sale_window_end_action in ('end_promo', 'set_price')
      and s.promo_price_cents is not null;

    update public.store_products set promo_price_cents = null
    where id = any(v_ids) and sale_window_end_action = 'end_promo';

    -- Novo preço abaixo do cheio continua como promoção ("de R$ 1.400 por
    -- R$ 1.250"); igual ou acima vira o preço cheio, sem riscado.
    update public.store_products
    set promo_price_cents = case when sale_window_end_price_cents < price_cents then sale_window_end_price_cents end,
        price_cents = greatest(price_cents, sale_window_end_price_cents)
    where id = any(v_ids) and sale_window_end_action = 'set_price';

    -- Histórico do gráfico de preço do admin (o PATCH grava pelo
    -- repositório; aqui não há rota no meio).
    insert into public.store_product_price_history (product_id, variant_id, price_cents, promo_price_cents, final_price_cents)
    select p.id, null, p.price_cents, p.promo_price_cents, coalesce(p.promo_price_cents, p.price_cents)
    from public.store_products p
    where p.id = any(v_ids) and p.sale_window_end_action in ('end_promo', 'set_price');

    -- 2) Vira produto de catálogo. O teto de reservas é da pré-venda; o
    --    prazo é zerado para a linha não ser pega de novo.
    update public.store_products
    set sale_type = 'normal',
        preorder_limit = case when sale_type = 'pre_order' then null else preorder_limit end,
        is_launch = false
    where id = any(v_ids);
  end if;

  -- Prazo vencido em produto que já não era pré-venda nem lançamento (o
  -- admin desmarcou antes): só limpa.
  update public.store_products
  set sale_window_ends_at = null,
      sale_window_end_action = 'keep',
      sale_window_end_price_cents = null
  where sale_window_ends_at <= now();

  return jsonb_build_object('closed', cardinality(v_ids));
end;
$$;

revoke execute on function public.close_store_sale_windows() from public, anon, authenticated;
grant execute on function public.close_store_sale_windows() to service_role;
