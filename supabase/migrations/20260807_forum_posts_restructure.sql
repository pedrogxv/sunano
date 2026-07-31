-- Reformulação do post do fórum: sem título separado (o corpo passa a ser
-- texto corrido, como um post do Reddit/tweet), categoria/subcategoria em
-- vez de periféricos vinculados, e mídia opcional (imagem ou vídeo).
--
-- `title`/`peripheral_refs`/`vote_score` só são removidos na migration
-- seguinte (20260808_forum_drop_legacy.sql), depois que repository/API/UI
-- já não os referenciarem mais — aqui é só schema aditivo + backfill.

alter table public.forum_posts
  add column if not exists category_id     uuid references public.forum_categories(id) on delete restrict,
  add column if not exists media_image_url text,
  add column if not exists media_video_url text;

alter table public.forum_posts
  drop constraint if exists forum_posts_single_media;
alter table public.forum_posts
  add constraint forum_posts_single_media check (
    not (media_image_url is not null and media_video_url is not null)
  );

create index if not exists idx_forum_posts_category on public.forum_posts (category_id, created_at desc);

-- 1) Título vira a primeira linha do novo corpo (abordagem mais simples: não
--    há heurística de formatação, só concatenação).
update public.forum_posts
set body = title || E'\n\n' || body
where title is not null and title <> '';

-- 2) Inferência best-effort de categoria a partir do 1º item de
--    peripheral_refs (join com peripherals.category -> slug da raiz
--    correspondente). Sem match ou sem peripheral_refs, cai em "geral".
do $$
declare
  r record;
  v_category_id uuid;
  v_general_id  uuid;
begin
  select id into v_general_id from public.forum_categories where slug = 'geral' and parent_id is null;

  for r in
    select id, peripheral_refs from public.forum_posts
    where peripheral_refs is not null and array_length(peripheral_refs, 1) > 0
  loop
    select fc.id into v_category_id
    from public.peripherals p
    join public.forum_categories fc on fc.slug = p.category::text and fc.parent_id is null
    where p.id = r.peripheral_refs[1];

    update public.forum_posts
    set category_id = coalesce(v_category_id, v_general_id)
    where id = r.id;
  end loop;

  update public.forum_posts set category_id = v_general_id where category_id is null;
end $$;

alter table public.forum_posts alter column category_id set not null;
