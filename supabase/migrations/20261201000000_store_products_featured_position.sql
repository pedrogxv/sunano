-- Ordem manual da seção "Selecionados da semana" (Destaques) da Home da Loja,
-- que hoje herda a ordenação padrão do catálogo (`created_at desc`). Mesmo
-- par de colunas de "Mais vendidos": o booleano diz QUEM aparece, a posição
-- diz EM QUE ORDEM (menor = mais à frente).
--
-- Null pra produto que não é destaque; recebe um valor ao marcar como
-- destaque e é regravado em bloco pela rota de reordenação
-- (arrastar-e-soltar em /admin/store).
alter table public.store_products
  add column if not exists featured_position integer;

-- Backfill: preserva a ordem que a Home já mostrava (mais recentes primeiro),
-- pra ninguém ver os destaques embaralharem no deploy. Só toca em linha sem
-- posição — reaplicar a migration não reembaralha uma ordem já ajustada.
with ranked as (
  select id, (row_number() over (order by created_at desc) - 1) as pos
  from public.store_products
  where is_featured
)
update public.store_products p
set featured_position = ranked.pos
from ranked
where p.id = ranked.id
  and p.featured_position is null;
