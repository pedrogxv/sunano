-- Normaliza a ordem dos produtos vinculados a cada periférico.
--
-- O vínculo periférico -> produto era gravado em `store_products.peripheral_id`
-- (coluna legada que nenhuma tela pública lê) enquanto a página do periférico
-- sempre leu `store_product_peripherals`. Com a escrita unificada nesta tabela,
-- as linhas antigas ficaram todas com `position = 0` — empate que fazia o
-- Postgres devolver os anúncios em ordem arbitrária, trocando sozinho qual
-- produto aparecia no botão "Comprar".
--
-- Reordena por tipo de venda (normal primeiro, depois pronta entrega e
-- pré-venda), com o nome como desempate estável.
with ranked as (
  select
    spp.product_id,
    spp.peripheral_id,
    row_number() over (
      partition by spp.peripheral_id
      order by
        case sp.sale_type
          when 'normal' then 0
          when 'ready_stock' then 1
          when 'pre_order' then 2
          else 99
        end,
        sp.name
    ) - 1 as new_position
  from public.store_product_peripherals spp
  join public.store_products sp on sp.id = spp.product_id
)
update public.store_product_peripherals spp
set position = ranked.new_position
from ranked
where spp.product_id = ranked.product_id
  and spp.peripheral_id = ranked.peripheral_id
  and spp.position is distinct from ranked.new_position;
