-- Campanhas sazonais da Loja (Black Friday, Natal, Páscoa...).
--
--   store_campaigns           uma campanha: tema, textos, período e se está
--                             ligada. O TEMA é só um nome (`black_friday`):
--                             cores, ícones e efeito (fogos, neve, confete)
--                             moram no código, em lib/store-campaigns.ts.
--                             Mesmo modelo das molduras: arte no código,
--                             dado no banco. Tema novo não precisa de
--                             migration, só da entrada no registro do código
--                             (a API recusa tema que o código não conhece).
--   store_campaign_products   os produtos escolhidos pelo admin, na ordem.
--
-- Sem grant ou policy para anon/authenticated: /loja lê no servidor e o painel
-- grava por /api/admin/store-campaigns, tudo com service_role
-- (store-campaigns-repository). RLS ligada e sem policy deixa a REST cega.

create table if not exists public.store_campaigns (
  id          uuid primary key default gen_random_uuid(),
  theme       text not null,
  title       text not null,
  subtitle    text,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  is_enabled  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.user_profiles(id) on delete set null
);

alter table public.store_campaigns drop constraint if exists store_campaigns_theme_check;
alter table public.store_campaigns add constraint store_campaigns_theme_check
  check (theme ~ '^[a-z][a-z0-9_]{1,31}$');

alter table public.store_campaigns drop constraint if exists store_campaigns_title_check;
alter table public.store_campaigns add constraint store_campaigns_title_check
  check (char_length(btrim(title)) between 1 and 40);

alter table public.store_campaigns drop constraint if exists store_campaigns_subtitle_check;
alter table public.store_campaigns add constraint store_campaigns_subtitle_check
  check (subtitle is null or char_length(subtitle) <= 90);

alter table public.store_campaigns drop constraint if exists store_campaigns_period_check;
alter table public.store_campaigns add constraint store_campaigns_period_check
  check (ends_at > starts_at);

-- Uma campanha no ar por vez. Duas ligadas com período sobreposto deixariam a
-- vitrine escolhendo uma no escuro; o banco recusa (23P01) e a rota traduz
-- para "já existe campanha ligada nesse período". Desligada não conta, então
-- dá para deixar a do ano que vem pronta e desligada.
alter table public.store_campaigns drop constraint if exists store_campaigns_no_overlap;
alter table public.store_campaigns add constraint store_campaigns_no_overlap
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
  where (is_enabled);

create index if not exists store_campaigns_ends_at_idx
  on public.store_campaigns (ends_at)
  where is_enabled;

create table if not exists public.store_campaign_products (
  campaign_id  uuid not null references public.store_campaigns(id) on delete cascade,
  product_id   uuid not null references public.store_products(id) on delete cascade,
  position     integer not null,
  primary key (campaign_id, product_id)
);

create index if not exists store_campaign_products_product_idx
  on public.store_campaign_products (product_id);

alter table public.store_campaigns enable row level security;
alter table public.store_campaign_products enable row level security;

revoke all on public.store_campaigns from anon, authenticated;
revoke all on public.store_campaign_products from anon, authenticated;

-- ────────────────────────────────────────────
-- Gravação atômica: campanha + lista de produtos numa transação só. Pela REST
-- seriam três chamadas (upsert, delete, insert), e uma falha no meio deixava a
-- campanha salva com a lista antiga ou vazia.
-- ────────────────────────────────────────────
create or replace function public.save_store_campaign(
  p_id uuid,
  p_theme text,
  p_title text,
  p_subtitle text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_enabled boolean,
  p_product_ids uuid[],
  p_admin_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_id is null then
    insert into public.store_campaigns (theme, title, subtitle, starts_at, ends_at, is_enabled, updated_by)
    values (p_theme, p_title, p_subtitle, p_starts_at, p_ends_at, p_is_enabled, p_admin_id)
    returning id into v_id;
  else
    update public.store_campaigns
       set theme = p_theme,
           title = p_title,
           subtitle = p_subtitle,
           starts_at = p_starts_at,
           ends_at = p_ends_at,
           is_enabled = p_is_enabled,
           updated_by = p_admin_id,
           updated_at = now()
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'store campaign % not found', p_id using errcode = 'P0002';
    end if;
  end if;

  delete from public.store_campaign_products where campaign_id = v_id;

  insert into public.store_campaign_products (campaign_id, product_id, position)
  select v_id, ids.product_id, ids.ord - 1
    from unnest(coalesce(p_product_ids, '{}'::uuid[])) with ordinality as ids(product_id, ord);

  return v_id;
end;
$$;

revoke execute on function public.save_store_campaign(uuid, text, text, text, timestamptz, timestamptz, boolean, uuid[], uuid) from public;
revoke execute on function public.save_store_campaign(uuid, text, text, text, timestamptz, timestamptz, boolean, uuid[], uuid) from anon, authenticated;
grant execute on function public.save_store_campaign(uuid, text, text, text, timestamptz, timestamptz, boolean, uuid[], uuid) to service_role;

-- ────────────────────────────────────────────
-- Black Friday 2026, que já estava no ar com data fixa no código: vira a
-- primeira campanha cadastrada, com os mesmos produtos que a seção mostrava
-- (os Destaques, na ordem). Id fixo para a migration poder rodar de novo.
-- ────────────────────────────────────────────
insert into public.store_campaigns (id, theme, title, subtitle, starts_at, ends_at, is_enabled)
values (
  'b1ac0f21-da70-4026-a000-000000000001',
  'black_friday',
  'Black Friday',
  'As maiores ofertas do ano na Sunano',
  '2026-11-26 00:00:00-03',
  '2026-12-01 23:59:59-03',
  true
)
on conflict (id) do nothing;

insert into public.store_campaign_products (campaign_id, product_id, position)
select 'b1ac0f21-da70-4026-a000-000000000001', p.id, row_number() over (order by p.featured_position nulls last, p.created_at) - 1
  from public.store_products p
 where p.is_featured
   and p.is_active
   and p.type = 'store'
   and not exists (
     select 1 from public.store_campaign_products cp
      where cp.campaign_id = 'b1ac0f21-da70-4026-a000-000000000001'
   )
on conflict do nothing;
