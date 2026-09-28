-- Busca da Loja: nome, marca, categoria, sensor e palavras-chave do Database
-- ao mesmo tempo.
--
-- Antes a busca era `name ILIKE %termo% OR brand ILIKE %termo%`: digitar
-- "3950" não achava mouse nenhum, porque o sensor mora no periférico do
-- Database ligado ao produto (`peripherals.specs->>'driver'`) ou numa linha
-- de `store_product_specs`, nunca no nome do anúncio.
--
-- Modelo: o termo chega da aplicação já quebrado em GRUPOS
-- (lib/store-search.ts). Cada grupo é uma palavra digitada mais os sinônimos
-- que a aplicação conhece (ex.: "teclado" → "keyboard", "leve" → tag
-- "light"). O produto precisa bater em TODOS os grupos, em qualquer campo, e
-- a nota soma o melhor campo de cada grupo: nome pesa mais que marca, que
-- pesa mais que ficha técnica.
--
-- Chamada só pelo servidor (service_role), como o resto do catálogo.

-- Minúsculas, sem acento, e tudo que não é letra/dígito vira um espaço só.
-- A versão TS (normalizeStoreSearchText) precisa produzir o mesmo texto.
create or replace function public.store_search_normalize(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select btrim(regexp_replace(
    lower(translate(
      coalesce(p_text, ''),
      'áàâãäåāéèêëēíìîïīóòôõöøōúùûüūçñýÁÀÂÃÄÅĀÉÈÊËĒÍÌÎÏĪÓÒÔÕÖØŌÚÙÛÜŪÇÑÝ',
      'aaaaaaaeeeeeiiiiiooooooouuuuucnyaaaaaaaeeeeeiiiiiooooooouuuuucny'
    )),
    '[^a-z0-9]+', ' ', 'g'
  ))
$$;

-- Qualidade do encontro de um termo (já normalizado) num campo (já
-- normalizado): 3 = palavra inteira, 2 = começo de palavra, 1 = em qualquer
-- ponto (inclusive ignorando espaços: "xlite" acha "x lite"), 0 = nada.
-- Termo normalizado só tem [a-z0-9 ], então `%`/`_` do LIKE nunca aparecem.
create or replace function public.store_search_hit(p_field text, p_token text)
returns integer
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when coalesce(p_token, '') = '' or coalesce(p_field, '') = '' then 0
    when (' ' || p_field || ' ') like ('% ' || p_token || ' %') then 3
    when (' ' || p_field) like ('% ' || p_token || '%') then 2
    when strpos(p_field, p_token) > 0 then 1
    when strpos(replace(p_field, ' ', ''), replace(p_token, ' ', '')) > 0 then 1
    else 0
  end
$$;

-- p_groups: jsonb array de arrays de texto, ex.: [["3950"], ["mouse", "mice"]].
-- p_phrase: a frase inteira digitada; bônus quando ela aparece no nome.
-- Devolve os produtos que batem, já em ordem de relevância, com o sensor
-- (para a busca explicar por que um "ATK X1" apareceu para "3950").
create or replace function public.store_search_products(
  p_groups jsonb,
  p_phrase text default null,
  p_include_inactive boolean default false
)
returns table (product_id uuid, score integer, sensor text, sensor_matched boolean)
language sql
stable
set search_path = public
as $$
  with grp as (
    select g.ord,
           array(
             select distinct public.store_search_normalize(t.v)
             from jsonb_array_elements_text(g.value) as t(v)
             where public.store_search_normalize(t.v) <> ''
           ) as alts
    from jsonb_array_elements(
      case when jsonb_typeof(p_groups) = 'array' then p_groups else '[]'::jsonb end
    ) with ordinality as g(value, ord)
    where jsonb_typeof(g.value) = 'array'
  ),
  grp_ok as (
    select grp.ord, grp.alts from grp where cardinality(grp.alts) > 0
  ),
  prod as (
    select p.id, p.name, p.brand, p.category, p.features, p.peripheral_id, p.is_featured, p.created_at
    from public.store_products p
    where p.type = 'store'
      and (p_include_inactive or p.is_active)
  ),
  -- Periféricos do Database ligados ao anúncio: a tabela de vínculo e a
  -- coluna legada `store_products.peripheral_id` (ver store-repository).
  linked as (
    select l.product_id as linked_product, l.peripheral_id as linked_peripheral, l.position as linked_position
    from public.store_product_peripherals l
    join prod on prod.id = l.product_id
    union all
    select prod.id, prod.peripheral_id, -1
    from prod
    where prod.peripheral_id is not null
  ),
  db as (
    select linked.linked_product,
           string_agg(concat_ws(' ',
             per.name, b.name, per.category, per.connectivity, per.mouse_shape,
             per.keyboard_layout, per.surface, per.profile, per.panel_type,
             array_to_string(per.tags, ' ')
           ), ' ') as keywords,
           string_agg(nullif(per.specs ->> 'driver', ''), ' ') as sensors,
           (array_agg(per.specs ->> 'driver' order by linked.linked_position)
              filter (where nullif(per.specs ->> 'driver', '') is not null))[1] as first_sensor
    from linked
    join public.peripherals per on per.id = linked.linked_peripheral
    left join public.brands b on b.id = per.brand_id
    group by linked.linked_product
  ),
  spec as (
    select s.product_id as spec_product,
           string_agg(concat_ws(' ', s.label, s.value), ' ') as specs_text,
           string_agg(s.value, ' ') filter (where s.label ilike '%sensor%') as sensors,
           (array_agg(s.value order by s.position) filter (where s.label ilike '%sensor%'))[1] as first_sensor
    from public.store_product_specs s
    join prod on prod.id = s.product_id
    group by s.product_id
  ),
  doc as (
    select prod.id as doc_id,
           prod.is_featured,
           prod.created_at,
           public.store_search_normalize(prod.name) as f_name,
           public.store_search_normalize(prod.brand) as f_brand,
           public.store_search_normalize(prod.category) as f_category,
           public.store_search_normalize(concat_ws(' ', spec.sensors, db.sensors)) as f_sensor,
           public.store_search_normalize(concat_ws(' ',
             spec.specs_text, db.keywords, array_to_string(prod.features, ' ')
           )) as f_extra,
           coalesce(spec.first_sensor, db.first_sensor) as doc_sensor
    from prod
    left join spec on spec.spec_product = prod.id
    left join db on db.linked_product = prod.id
  ),
  -- Peso por campo × qualidade do encontro (índice = hit + 1). Categoria
  -- como palavra inteira pesa quase o nome: quem digita "mouse" quer os
  -- mouses antes dos "Mousepad X", cujo nome só COMEÇA com o termo.
  hit as (
    select doc.doc_id,
           grp_ok.ord,
           max(greatest(
             (array[0, 5, 8, 10])[public.store_search_hit(doc.f_name, a.alt) + 1],
             (array[0, 3, 6, 7])[public.store_search_hit(doc.f_brand, a.alt) + 1],
             (array[0, 5, 6, 6])[public.store_search_hit(doc.f_sensor, a.alt) + 1],
             (array[0, 2, 5, 9])[public.store_search_hit(doc.f_category, a.alt) + 1],
             (array[0, 1, 2, 3])[public.store_search_hit(doc.f_extra, a.alt) + 1]
           )) as weight,
           -- "Bateu pelo sensor" só quando nome e marca não bateram: quem
           -- digita "logi" achou a marca Logitech, não o sensor "Logitech HERO".
           bool_or(
             public.store_search_hit(doc.f_sensor, a.alt) > 0
             and public.store_search_hit(doc.f_name, a.alt) = 0
             and public.store_search_hit(doc.f_brand, a.alt) = 0
           ) as on_sensor
    from doc
    cross join grp_ok
    cross join lateral unnest(grp_ok.alts) as a(alt)
    group by doc.doc_id, grp_ok.ord
  ),
  ranked as (
    select hit.doc_id,
           sum(hit.weight)::integer as base_score,
           bool_or(hit.on_sensor) as on_sensor
    from hit
    where hit.weight > 0
    group by hit.doc_id
    having count(*) = (select count(*) from grp_ok)
  ),
  -- Bônus de frase: só para termo de mais de uma palavra ("g pro x"), que os
  -- grupos soltos não capturam em ordem. Palavra única já é pesada pelo
  -- grupo; com bônus, "mouse" dentro de "Mousepad" passaria os mouses.
  phrase as (
    select public.store_search_normalize(p_phrase) as spaced,
           replace(public.store_search_normalize(p_phrase), ' ', '') as compact
  )
  select ranked.doc_id,
         ranked.base_score
           + case
               when strpos(phrase.spaced, ' ') = 0 then 0
               when strpos(' ' || doc.f_name || ' ', ' ' || phrase.spaced || ' ') > 0 then 6
               when strpos(replace(doc.f_name, ' ', ''), phrase.compact) > 0 then 3
               else 0
             end,
         doc.doc_sensor,
         ranked.on_sensor
  from ranked
  join doc on doc.doc_id = ranked.doc_id
  cross join phrase
  where (select count(*) from grp_ok) > 0
  order by 2 desc, doc.is_featured desc, doc.created_at desc
$$;

revoke execute on function public.store_search_normalize(text) from public, anon, authenticated;
revoke execute on function public.store_search_hit(text, text) from public, anon, authenticated;
revoke execute on function public.store_search_products(jsonb, text, boolean) from public, anon, authenticated;

grant execute on function public.store_search_normalize(text) to service_role;
grant execute on function public.store_search_hit(text, text) to service_role;
grant execute on function public.store_search_products(jsonb, text, boolean) to service_role;
