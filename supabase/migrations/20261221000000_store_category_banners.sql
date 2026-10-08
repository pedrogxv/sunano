-- Banner de categoria da Loja (/loja/categoria/<categoria>).
--
-- Os banners de seção saíram do meio da Home (Pré-venda, Mais vendidos,
-- Itens para o site): a Home agora é só produto. O lugar deles passa a ser o
-- topo da página de cada categoria, no lugar do cabeçalho padrão ("Categoria
-- Mouse · 13 produtos"). Sem banner ativo, a categoria continua com o
-- cabeçalho de sempre.
--
-- Mesma tabela, seção nova `category` + a coluna que diz QUAL categoria.
-- `store_products.category` é texto livre (sem enum), então aqui também.
-- As seções antigas seguem válidas no CHECK: os banners que já existem nelas
-- não somem, ficam fora do ar e o painel deixa movê-los para uma categoria.

alter table public.store_section_banners
  add column if not exists category text;

comment on column public.store_section_banners.category is
  'Categoria da Loja (mesmo valor de store_products.category) quando section = ''category''. Nulo nas outras seções.';

comment on column public.store_section_banners.section is
  'category = topo de /loja/categoria/<category>. main | best_sellers | pre_sale | ready_stock | site_items são seções antigas, fora do ar.';

alter table public.store_section_banners
  drop constraint if exists store_section_banners_section_check;
alter table public.store_section_banners
  add constraint store_section_banners_section_check
  check (section in ('main', 'best_sellers', 'pre_sale', 'ready_stock', 'site_items', 'category'));

-- Categoria obrigatória na seção `category` e proibida nas outras: um banner
-- de categoria sem categoria não aparece em lugar nenhum, e uma categoria
-- solta numa seção antiga faria o painel listar o banner na aba errada.
alter table public.store_section_banners
  drop constraint if exists store_section_banners_category_check;
alter table public.store_section_banners
  add constraint store_section_banners_category_check
  check (
    (section = 'category') = (category is not null and char_length(trim(category)) > 0)
  );

create index if not exists store_section_banners_category_active_idx
  on public.store_section_banners (category, sort_order, created_at)
  where is_active = true and section = 'category';
