-- Threads simples de 1 nível nos comentários do fórum: um comentário pode
-- responder a outro (`parent_comment_id`), mas a resposta sempre aponta pra
-- um comentário raiz — sem aninhamento infinito, igual à profundidade de
-- `forum_categories` (categoria > subcategoria).

alter table public.forum_comments
  add column if not exists parent_comment_id uuid references public.forum_comments(id) on delete cascade;

create index if not exists idx_forum_comments_parent
  on public.forum_comments (parent_comment_id);

-- Garante que uma resposta não pode apontar pra outra resposta (mantém a
-- thread em 1 nível, validado aqui e não só na UI/repositório).
create or replace function public.forum_comments_check_depth()
returns trigger language plpgsql as $$
declare
  v_grandparent uuid;
begin
  if new.parent_comment_id is not null then
    if new.parent_comment_id = new.id then
      raise exception 'forum_comments: um comentário não pode responder a si mesmo';
    end if;
    select parent_comment_id into v_grandparent
    from public.forum_comments where id = new.parent_comment_id;
    if v_grandparent is not null then
      raise exception 'forum_comments: máximo de 1 nível de resposta (responda ao comentário raiz)';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_forum_comments_check_depth on public.forum_comments;
create trigger trg_forum_comments_check_depth
  before insert or update on public.forum_comments
  for each row execute function public.forum_comments_check_depth();
