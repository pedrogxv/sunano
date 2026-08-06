-- Título volta a existir separado do corpo (reverte a decisão de
-- 20260807_forum_posts_restructure.sql / 20260808_forum_drop_legacy.sql, que
-- tinham fundido tudo em texto corrido estilo Reddit/tweet). Corpo passa a
-- ser complementar e opcional — o título é o campo obrigatório agora.
--
-- Backfill: usa a 1ª linha do corpo atual como título (mesma heurística que
-- `slugSeedFromBody` já aplicava pra gerar o slug), e limpa essa linha do
-- corpo pra não duplicar o texto. Post cujo corpo não sobra nada depois de
-- tirar a 1ª linha fica com body vazio (null) — é o caso normal do texto
-- corrido antigo, que agora deveria ter sido só o "título".

alter table public.forum_posts
  add column if not exists title text,
  alter column body drop not null;

update public.forum_posts
set
  title = coalesce(nullif(left(trim(split_part(body, E'\n', 1)), 200), ''), 'Sem título'),
  body = nullif(trim(substring(body from length(split_part(body, E'\n', 1)) + 1)), '')
where title is null;

alter table public.forum_posts
  alter column title set not null;

alter table public.forum_posts
  add constraint forum_posts_title_length check (char_length(title) between 1 and 200);

-- `body_preview` era gerada de `body` (`left(body, 280)`); com body opcional,
-- volta a ser gerada mas cai pro título quando não há corpo, pra listagens
-- que só leem `body_preview` sempre terem algo pra mostrar.
alter table public.forum_posts drop column if exists body_preview;
alter table public.forum_posts
  add column body_preview text generated always as (left(coalesce(body, title), 280)) stored;
