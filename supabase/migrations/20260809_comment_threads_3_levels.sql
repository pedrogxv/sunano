-- Amplia as threads de comentários (fórum e blog) de 1 para 4 níveis de
-- profundidade. `parent_comment_id` deixa de ser sempre reancorado na raiz
-- (repositório) e passa a apontar pro pai imediato de verdade; o trigger
-- valida a profundidade subindo a cadeia de pais em vez de checar só o avô.

create or replace function public.forum_comments_check_depth()
returns trigger language plpgsql as $$
declare
  v_depth int := 0;
  v_current uuid;
begin
  if new.parent_comment_id is not null then
    if new.parent_comment_id = new.id then
      raise exception 'forum_comments: um comentário não pode responder a si mesmo';
    end if;

    v_current := new.parent_comment_id;
    v_depth := 1;
    while v_current is not null loop
      select parent_comment_id into v_current
      from public.forum_comments where id = v_current;
      v_depth := v_depth + 1;
      if v_depth > 4 then
        raise exception 'forum_comments: máximo de 4 níveis de resposta';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.blog_comments_check_depth()
returns trigger language plpgsql as $$
declare
  v_depth int := 0;
  v_current uuid;
begin
  if new.parent_comment_id is not null then
    if new.parent_comment_id = new.id then
      raise exception 'blog_comments: um comentário não pode responder a si mesmo';
    end if;

    v_current := new.parent_comment_id;
    v_depth := 1;
    while v_current is not null loop
      select parent_comment_id into v_current
      from public.blog_comments where id = v_current;
      v_depth := v_depth + 1;
      if v_depth > 4 then
        raise exception 'blog_comments: máximo de 4 níveis de resposta';
      end if;
    end loop;
  end if;
  return new;
end;
$$;
