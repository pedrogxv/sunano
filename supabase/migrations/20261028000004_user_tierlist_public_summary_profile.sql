-- Reescreve `user_tierlist_public_summary` para já trazer os dados do perfil
-- e filtrar quem não pode aparecer na listagem.
--
-- Motivo: PostgREST não consegue fazer o embed `user_profiles!inner(...)`
-- sobre a versão anterior (uma view sem FK declarada — a relação
-- view.user_id -> user_profiles.id não é auto-detectável), o que quebrava
-- `/tierlist/comunidade` com PGRST200. Trazendo as colunas do perfil pra
-- dentro da própria view, a rota lê tudo de uma vez, sem embed.
--
-- Filtro embutido: só entram tierlists de membros com `display_slug`
-- (precisam de URL canônica) e o perfil do próprio site fica de fora.
--
-- `security_invoker = true`: herda as RLS das tabelas base —
-- `user_tierlist_items` / `user_tierlist_meta` já são `select using (true)`,
-- e `user_profiles` é lido aqui só com colunas públicas (as mesmas do
-- diretório de membros).

drop view if exists public.user_tierlist_public_summary;

create view public.user_tierlist_public_summary
with (security_invoker = true)
as
select
  i.user_id,
  count(*)                     as item_count,
  max(i.updated_at)            as last_item_at,
  coalesce(m.hearts_count, 0)  as hearts_count,
  m.note,
  p.display_name,
  p.display_slug,
  p.avatar_url,
  p.account_tier,
  p.vip_expires_at
from public.user_tierlist_items i
join public.user_profiles p on p.id = i.user_id
left join public.user_tierlist_meta m on m.user_id = i.user_id
where p.display_slug is not null
  and p.display_slug <> 'sunano'
group by
  i.user_id, m.hearts_count, m.note,
  p.display_name, p.display_slug, p.avatar_url, p.account_tier, p.vip_expires_at;

comment on view public.user_tierlist_public_summary is
  'Resumo das tierlists pessoais publicáveis (>= 1 item, membro com slug, exclui o perfil do site) + dados do perfil, para /tierlist/comunidade. security_invoker: herda RLS das tabelas base.';
