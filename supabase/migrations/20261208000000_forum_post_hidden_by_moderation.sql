-- Post ocultado pela moderação não pode ser reexibido pelo autor.
--
-- `forum_posts.is_hidden` é a mesma coluna para "o autor ocultou" e "a
-- moderação ocultou", e a rota do autor (/api/forum/posts/[slug]/visibility)
-- só conferia o dono. Quem teve o post removido pelo painel, ou pelo
-- banimento (admin_ban_account esconde todo o conteúdo da conta), chamava a
-- rota com `hidden: false` e o post voltava ao ar.
--
-- `hidden_by_moderation` separa os dois casos. Quem liga:
--   - o painel (setForumPostFlag e o PATCH de admin em forum-repository.ts);
--   - este trigger, quando o post some enquanto o autor está banido. Fica em
--     trigger e não no corpo de admin_ban_account pelo mesmo motivo das
--     outras automações: a próxima recriação da RPC que esquecer o trecho
--     reabre o buraco em silêncio. O ban grava account_banned_at ANTES de
--     esconder o conteúdo, então o autor já consta banido quando o UPDATE
--     chega aqui.
-- Quem desliga: o próprio trigger, sempre que o post volta a aparecer. Assim
-- "marcado pela moderação" nunca sobra num post visível, e reexibir pelo
-- painel devolve ao autor o controle normal.

alter table public.forum_posts
  add column if not exists hidden_by_moderation boolean not null default false;

create or replace function public.trg_forum_posts_hidden_by_moderation()
returns trigger
language plpgsql
set search_path = public as $$
begin
  if not new.is_hidden then
    new.hidden_by_moderation := false;
  elsif not old.is_hidden
    and exists (
      select 1 from public.user_profiles
      where id = new.user_id and account_banned_at is not null
    )
  then
    new.hidden_by_moderation := true;
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_forum_posts_hidden_by_moderation() from public, anon, authenticated;

drop trigger if exists trg_forum_posts_hidden_by_moderation on public.forum_posts;
create trigger trg_forum_posts_hidden_by_moderation
  before update of is_hidden, hidden_by_moderation on public.forum_posts
  for each row execute function public.trg_forum_posts_hidden_by_moderation();

-- Backfill: dos posts já ocultos, só os de conta banida têm origem certa. O
-- painel não registrava quem ocultou, então os demais ficam como estão; a
-- equipe marca os que forem de moderação ocultando de novo pelo painel.
update public.forum_posts f
set hidden_by_moderation = true
from public.user_profiles u
where u.id = f.user_id
  and u.account_banned_at is not null
  and f.is_hidden
  and not f.hidden_by_moderation;
