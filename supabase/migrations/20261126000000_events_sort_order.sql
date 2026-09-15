-- Ordem de exibição das conquistas em /conquistas e na Home.
--
-- Sem isso a lista só tinha `start_date desc` como critério — não dava pra
-- destacar uma conquista nova sem mexer na data de início dela. Mesmo padrão
-- de `home_banners`/`forum_categories`: `sort_order` inteiro, reordenado pelo
-- admin com drag and drop (`PATCH /api/admin/events/reorder`), que regrava o
-- índice de cada id na lista.
--
-- Backfill usa a MESMA ordem que já estava em produção (start_date desc) pra
-- ninguém ver a grade embaralhar antes do admin reordenar pela primeira vez.

alter table public.events
  add column if not exists sort_order integer not null default 0;

comment on column public.events.sort_order is
  'Ordem de exibição em /conquistas e na Home — menor aparece primeiro. Reordenado pelo admin (drag and drop).';

with ordered as (
  select id, row_number() over (order by start_date desc) - 1 as rn
  from public.events
)
update public.events e
set sort_order = ordered.rn
from ordered
where ordered.id = e.id;

create index if not exists idx_events_sort_order on public.events (sort_order, start_date);
