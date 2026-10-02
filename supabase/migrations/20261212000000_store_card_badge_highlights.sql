-- Card da vitrine: selo principal e características técnicas escolhidos pelo admin.
--
--   store_products.card_badge        selo escolhido à mão. Nulo = automático
--                                    (lib/store-card.ts decide: estoque baixo,
--                                    mais vendido, custo-benefício do Database,
--                                    novo). 'none' é ESCOLHA ("sem selo"), não
--                                    slot vazio: o mesmo erro de "Nenhuma" nas
--                                    molduras, onde nulo caía no fallback e a
--                                    pessoa não conseguia tirar o enfeite.
--                                    Pré-venda e Estoque baixo NÃO são opções:
--                                    são estados do produto, e escolhê-los à
--                                    mão faria o card prometer o que não é.
--   store_products.card_highlights   até 3 características curtas ("49g",
--                                    "PAW3950", "8K"). Vazio = o servidor
--                                    deriva do Database e da ficha técnica; o
--                                    campo manual existe para o que o Database
--                                    não tem (IEM, DAC, acessório).
--
-- A vitrine lê no servidor (store-repository). Sem grant novo: a coluna herda
-- o que `store_products` já tem.
--
-- No fim, a barra comercial deixa de dizer "Frete calculado no carrinho".

alter table public.store_products add column if not exists card_badge text;
alter table public.store_products add column if not exists card_highlights text[] not null default '{}';

alter table public.store_products drop constraint if exists store_products_card_badge_check;
alter table public.store_products add constraint store_products_card_badge_check
  check (card_badge is null or card_badge in ('sunano_choice', 'limited_edition', 'best_value', 'new', 'none'));

-- O limite por item (18 caracteres) é validado na API; aqui fica o teto que
-- impede um card de virar parágrafo mesmo se alguém gravar direto no banco.
alter table public.store_products drop constraint if exists store_products_card_highlights_check;
alter table public.store_products add constraint store_products_card_highlights_check
  check (
    cardinality(card_highlights) <= 3
    and coalesce(char_length(array_to_string(card_highlights, '')), 0) <= 54
  );

-- ────────────────────────────────────────────
-- Barra comercial: "Frete calculado no carrinho" → "Frete grátis"
-- ────────────────────────────────────────────
-- O checkout nunca cobrou frete, e o card e a página do produto agora dizem
-- "Frete grátis"; a barra logo acima deles dizia o contrário. Só troca o texto
-- do seed (20261204000000): se o admin já tiver escrito outra coisa no painel,
-- a escolha dele fica.
update public.store_commerce_bar
set benefits = (
  select jsonb_agg(
    case
      when item->>'text' = 'Frete calculado no carrinho'
        then jsonb_set(item, '{text}', to_jsonb('Frete grátis para todo o Brasil'::text))
      else item
    end
    order by idx
  )
  from jsonb_array_elements(benefits) with ordinality as entry(item, idx)
)
where benefits @> '[{"text": "Frete calculado no carrinho"}]'::jsonb;
