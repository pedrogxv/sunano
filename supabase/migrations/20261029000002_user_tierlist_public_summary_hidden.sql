-- Reescreve `user_tierlist_public_summary` para excluir tierlists que o dono
-- ocultou (`user_tierlist_meta.is_hidden = true` — ver migration
-- 20261029000001).
--
-- Mantém tudo que a 20261028000004 já fazia: dados do perfil embutidos,
-- filtro de `display_slug` / perfil do site, `security_invoker` herdando as
-- RLS das tabelas base.

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
  and coalesce(m.is_hidden, false) = false
group by
  i.user_id, m.hearts_count, m.note,
  p.display_name, p.display_slug, p.avatar_url, p.account_tier, p.vip_expires_at;

comment on view public.user_tierlist_public_summary is
  'Resumo das tierlists pessoais publicáveis (>= 1 item, membro com slug, exclui o perfil do site e as ocultas) + dados do perfil, para /tierlist/comunidade. security_invoker: herda RLS das tabelas base.';
