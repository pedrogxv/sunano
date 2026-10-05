-- Pré-venda com prazo: desconto inicial, depois preço cheio por mais dias, e
-- a saída AUTOMÁTICA da seção "Lançamentos e Pré-venda".
--
-- Fases (datas, lidas em lib/store-preorder.ts):
--   early    agora < preorder_early_ends_at   -> preço promocional (o que o
--            admin pôs em promo_price_cents) e contagem "o desconto acaba em X"
--   regular  early_ends_at <= agora < ends_at -> preço cheio, ainda pré-venda
--            (a janela é de 7 dias; o servidor grava preorder_ends_at)
--   normal   agora >= preorder_ends_at        -> sale_type vira 'normal' e o
--            produto cai no catálogo comum
--
-- Quem avança as fases é `advance_preorder_phases`, chamada pelo cron
-- /api/cron/preorder-phases. Fica no banco (e não em TS) porque são três
-- tabelas mexidas juntas: promo do produto, das variantes e das combinações.
-- Preço cobrado sai sempre de promo_price_cents, então apagar a promoção É
-- subir o preço, em vitrine, página, carrinho e checkout ao mesmo tempo.
--
-- Sem preorder_early_ends_at o produto se comporta como antes: pré-venda sem
-- prazo, até o admin trocar para Normal à mão.

alter table public.store_products
  add column if not exists preorder_early_ends_at timestamptz,
  add column if not exists preorder_ends_at timestamptz;

alter table public.store_products
  drop constraint if exists store_products_preorder_window_check;
alter table public.store_products
  add constraint store_products_preorder_window_check
  check (preorder_ends_at is null or (preorder_early_ends_at is not null and preorder_ends_at > preorder_early_ends_at));

comment on column public.store_products.preorder_early_ends_at is
  'Fim do preço promocional de pré-venda. Passada a data, o cron apaga a promoção e o preço sobe. Nulo = pré-venda sem prazo.';
comment on column public.store_products.preorder_ends_at is
  'Fim da pré-venda (early_ends_at + 7 dias, gravado pelo servidor). Passada a data, o cron vira sale_type para normal.';

create or replace function public.advance_preorder_phases()
returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_raised integer;
  v_ended integer;
begin
  -- 1) Fim do desconto inicial: apaga a promoção do produto, das variantes e
  --    das combinações. Roda também para quem já passou da fase 2, então um
  --    produto cujo prazo inteiro venceu entre duas execuções sobe de preço
  --    antes de virar normal.
  update public.store_product_variants set promo_price_cents = null
  where promo_price_cents is not null
    and product_id in (
      select id from public.store_products
      where sale_type = 'pre_order' and preorder_early_ends_at <= now()
    );

  update public.store_product_skus set promo_price_cents = null
  where promo_price_cents is not null
    and product_id in (
      select id from public.store_products
      where sale_type = 'pre_order' and preorder_early_ends_at <= now()
    );

  with raised as (
    update public.store_products set promo_price_cents = null
    where sale_type = 'pre_order'
      and preorder_early_ends_at <= now()
      and promo_price_cents is not null
    returning id
  )
  select count(*) into v_raised from raised;

  -- 2) Fim da pré-venda: vira produto de catálogo. O prazo é zerado para a
  --    linha não ser pega de novo se o admin reabrir uma pré-venda depois.
  with ended as (
    update public.store_products
    set sale_type = 'normal',
        preorder_early_ends_at = null,
        preorder_ends_at = null,
        preorder_limit = null
    where sale_type = 'pre_order' and preorder_ends_at <= now()
    returning id
  )
  select count(*) into v_ended from ended;

  return jsonb_build_object('raised', v_raised, 'ended', v_ended);
end;
$$;

revoke execute on function public.advance_preorder_phases() from public, anon, authenticated;
grant execute on function public.advance_preorder_phases() to service_role;
