-- Permite mais de uma imagem por post do fórum (carrossel estilo Reddit).
-- Substitui `media_image_url` (texto único) por `media_image_urls` (array),
-- migrando os dados existentes. Vídeo continua único (link do YouTube) e
-- mutuamente exclusivo com imagem — a constraint é recriada sobre o array.

alter table public.forum_posts
  add column if not exists media_image_urls text[] not null default '{}';

update public.forum_posts
set media_image_urls = array[media_image_url]
where media_image_url is not null
  and media_image_urls = '{}';

alter table public.forum_posts
  drop constraint if exists forum_posts_single_media;

alter table public.forum_posts
  add constraint forum_posts_single_media check (
    not (cardinality(media_image_urls) > 0 and media_video_url is not null)
  );

alter table public.forum_posts
  add constraint forum_posts_media_image_limit check (
    cardinality(media_image_urls) <= 5
  );

alter table public.forum_posts
  drop column if exists media_image_url;
