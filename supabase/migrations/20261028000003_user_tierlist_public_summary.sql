-- View de resumo público das tierlists pessoais dos membros.
--
-- Alimenta `/tierlist/comunidade` — a listagem de todas as tierlists que já
-- têm ao menos um periférico classificado. Postgrest não faz `group by`
-- direto numa query normal, então a agregação (contagem de itens, data do
-- item mais recente) mora aqui, numa view, e a rota só pagina/ordena sobre
-- ela.
--
-- `security_invoker = true`: a view roda com as permissões de quem consulta,
-- então herda as RLS policies das tabelas base. Isso é o que queremos —
-- `user_tierlist_items` ("Tierlist items are publicly readable", migration
-- 20260922000008) e `user_tierlist_meta` ("Tierlist meta is publicly
-- readable", migration 20261011000000) já têm `select using (true)`, logo a
-- leitura pública da view funciona sem policy nova.

create or replace view public.user_tierlist_public_summary
with (security_invoker = true)
as
select
  i.user_id,
  count(*)                    as item_count,
  max(i.updated_at)           as last_item_at,
  coalesce(m.hearts_count, 0) as hearts_count,
  m.note
from public.user_tierlist_items i
left join public.user_tierlist_meta m on m.user_id = i.user_id
group by i.user_id, m.hearts_count, m.note;

comment on view public.user_tierlist_public_summary is
  'Resumo agregado das tierlists pessoais com >= 1 item, para a listagem /tierlist/comunidade. security_invoker: herda RLS das tabelas base.';
