-- Varredura 6 de RLS: linha "filha" legível pela chave anon mesmo com o pai
-- oculto, e dois ids de admin em tabela pública.
--
-- O app não lê nada disto pela REST (tudo passa por rota com service_role),
-- então nenhuma tela muda. O que muda é o que um visitante consegue tirar
-- direto de /rest/v1 com a chave pública.
--
-- 1. Tierlist oculta continuava legível. As policies de items/tiers diziam
--    "NOT EXISTS (meta com is_hidden)", mas a subconsulta roda sob a RLS de
--    `user_tierlist_meta`, que ESCONDE do visitante justamente a meta oculta.
--    O NOT EXISTS dava sempre true: 8 itens e 5 faixas de uma tierlist oculta
--    saíam para qualquer um. A regra passa a ser positiva ("existe meta que eu
--    consigo ver"), que a RLS da meta só ajuda. Para isso toda tierlist
--    precisa ter meta: backfill + trigger na primeira faixa/item.
-- 2. Comentário de post oculto (forum) e de post não publicado (blog)
--    continuavam legíveis, e forum_post_peripherals entregava o id do post
--    oculto. A rota já filtrava (listForumComments); a REST não.
-- 3. Filhas de produto inativo da loja (specs, variantes, grupos, opções,
--    imagens, combinações, periféricos, reviews) liam com `true`.
-- 4. Item de Aura à venda ainda não lançado (active = false, acquisition =
--    'purchase') e evento inativo apareciam na leitura pública. Molduras de
--    VIP, Fundador, ofensiva e ranking são `active = false` por não estarem à
--    venda, mas aparecem nos avatares: seguem legíveis.
-- 5. `user_medals.granted_by` e `store_product_sunano_reviews.author_admin_id`
--    davam o uuid de quem é admin. Grant por coluna sem eles.
--
-- Mesmo cuidado de sempre com subconsulta em policy: só EXISTS de pai
-- VISÍVEL. Nunca NOT EXISTS de pai oculto (item 1).

-- 1. Tierlist ---------------------------------------------------------------

insert into public.user_tierlist_meta (user_id)
select distinct user_id from public.user_tierlist_tiers
union
select distinct user_id from public.user_tierlist_items
on conflict (user_id) do nothing;

create or replace function public.trg_ensure_user_tierlist_meta()
returns trigger
language plpgsql
set search_path = public as $$
begin
  insert into public.user_tierlist_meta (user_id) values (new.user_id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.trg_ensure_user_tierlist_meta() from public, anon, authenticated;

drop trigger if exists trg_ensure_user_tierlist_meta on public.user_tierlist_tiers;
create trigger trg_ensure_user_tierlist_meta
  after insert on public.user_tierlist_tiers
  for each row execute function public.trg_ensure_user_tierlist_meta();

drop trigger if exists trg_ensure_user_tierlist_meta on public.user_tierlist_items;
create trigger trg_ensure_user_tierlist_meta
  after insert on public.user_tierlist_items
  for each row execute function public.trg_ensure_user_tierlist_meta();

drop policy if exists "Tierlist items are publicly readable" on public.user_tierlist_items;
create policy "Tierlist items are publicly readable" on public.user_tierlist_items
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.user_tierlist_meta m where m.user_id = user_tierlist_items.user_id and not m.is_hidden)
  );

drop policy if exists "Tierlist tiers are publicly readable" on public.user_tierlist_tiers;
create policy "Tierlist tiers are publicly readable" on public.user_tierlist_tiers
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.user_tierlist_meta m where m.user_id = user_tierlist_tiers.user_id and not m.is_hidden)
  );

drop policy if exists "Tierlist hearts are publicly readable" on public.user_tierlist_hearts;
create policy "Tierlist hearts are publicly readable" on public.user_tierlist_hearts
  for select using (
    auth.uid() in (owner_id, user_id)
    or exists (select 1 from public.user_tierlist_meta m where m.user_id = user_tierlist_hearts.owner_id and not m.is_hidden)
  );

-- 2. Fórum e blog -----------------------------------------------------------

drop policy if exists "Forum comments are publicly readable" on public.forum_comments;
create policy "Forum comments are publicly readable" on public.forum_comments
  for select using (
    is_hidden = false
    and exists (select 1 from public.forum_posts p where p.id = forum_comments.post_id and not p.is_hidden)
  );

drop policy if exists "forum_post_peripherals_select_public" on public.forum_post_peripherals;
create policy "forum_post_peripherals_select_public" on public.forum_post_peripherals
  for select using (
    exists (select 1 from public.forum_posts p where p.id = forum_post_peripherals.post_id and not p.is_hidden)
  );

drop policy if exists "Blog comments are publicly readable" on public.blog_comments;
create policy "Blog comments are publicly readable" on public.blog_comments
  for select using (
    is_hidden = false
    and exists (select 1 from public.blog_posts p where p.id = blog_comments.post_id and p.is_published)
  );

-- 3. Loja -------------------------------------------------------------------

drop policy if exists "Public read product peripherals" on public.store_product_peripherals;
create policy "Public read product peripherals" on public.store_product_peripherals
  for select using (
    exists (select 1 from public.store_products p where p.id = store_product_peripherals.product_id and p.is_active)
  );

drop policy if exists "Public read specs" on public.store_product_specs;
create policy "Public read specs" on public.store_product_specs
  for select using (
    exists (select 1 from public.store_products p where p.id = store_product_specs.product_id and p.is_active)
  );

drop policy if exists "Public read variant groups" on public.store_product_variant_groups;
create policy "Public read variant groups" on public.store_product_variant_groups
  for select using (
    exists (select 1 from public.store_products p where p.id = store_product_variant_groups.product_id and p.is_active)
  );

drop policy if exists "Public read variant group options" on public.store_product_variant_group_options;
create policy "Public read variant group options" on public.store_product_variant_group_options
  for select using (
    exists (
      select 1 from public.store_product_variant_groups g
      join public.store_products p on p.id = g.product_id
      where g.id = store_product_variant_group_options.group_id and p.is_active
    )
  );

drop policy if exists "Public read variant combinations" on public.store_product_variant_combinations;
create policy "Public read variant combinations" on public.store_product_variant_combinations
  for select using (
    exists (select 1 from public.store_products p where p.id = store_product_variant_combinations.product_id and p.is_active)
  );

drop policy if exists "Public read active variants" on public.store_product_variants;
create policy "Public read active variants" on public.store_product_variants
  for select using (
    is_active = true
    and exists (select 1 from public.store_products p where p.id = store_product_variants.product_id and p.is_active)
  );

drop policy if exists "Public read variant images" on public.store_product_variant_images;
create policy "Public read variant images" on public.store_product_variant_images
  for select using (
    exists (
      select 1 from public.store_product_variants v
      join public.store_products p on p.id = v.product_id
      where v.id = store_product_variant_images.variant_id and v.is_active and p.is_active
    )
  );

drop policy if exists "Public read published reviews" on public.store_product_reviews;
create policy "Public read published reviews" on public.store_product_reviews
  for select using (
    status = 'published'
    and exists (select 1 from public.store_products p where p.id = store_product_reviews.product_id and p.is_active)
  );

drop policy if exists "Public read published sunano review" on public.store_product_sunano_reviews;
create policy "Public read published sunano review" on public.store_product_sunano_reviews
  for select using (
    published = true
    and exists (select 1 from public.store_products p where p.id = store_product_sunano_reviews.product_id and p.is_active)
  );

-- 4. Aura e eventos ---------------------------------------------------------

drop policy if exists "Aura items are publicly readable" on public.aura_items;
create policy "Aura items are publicly readable" on public.aura_items
  for select using (active or acquisition <> 'purchase');

drop policy if exists "Events are publicly readable" on public.events;
create policy "Events are publicly readable" on public.events
  for select using (active);

-- 5. Id de admin fora da leitura pública ------------------------------------

revoke select on public.user_medals from anon, authenticated;
grant select (user_id, medal_id, awarded_at, pinned, pinned_order)
  on public.user_medals to anon, authenticated;

revoke select on public.store_product_sunano_reviews from anon, authenticated;
grant select (id, product_id, rating, title, body, video_url, published, created_at, updated_at)
  on public.store_product_sunano_reviews to anon, authenticated;
