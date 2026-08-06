-- Reabre reação em post do fórum — pedido do produto, revertendo a postura
-- de 20260804130000_aura_no_post_reactions.sql ("quem posta é premiado, não
-- julgado"). Dessa vez só na metade: post ganha um "dar aura" (like), nunca
-- dislike — continua impossível o post render aura negativa pro autor, só
-- não fica mais travado em zero interação.
--
-- Função dedicada (`toggle_forum_post_aura`) em vez de reaproveitar
-- `toggle_forum_aura`: post não tem o terceiro estado (trocar like<->dislike)
-- que aquela função existe pra tratar, então misturar os dois só complicaria
-- os dois casos. `forum_aura.post_id` e as constraints/índices que o
-- suportam já existem desde 20260806_forum_aura.sql e nunca foram
-- removidos — só pararam de ser alcançados.
--
-- `forum_posts.aura_count` já é o somatório da aura de comentários (ver
-- 20260823000000_forum_post_aura_from_comments.sql); esta função soma a
-- reação direta em cima do mesmo campo, então o número exibido no card passa
-- a ser "aura dos comentários + aura dada direto no post" — sem precisar de
-- uma coluna nova nem de reescrever o card pra mostrar dois números.
create or replace function public.toggle_forum_post_aura(
  p_giver_id uuid,
  p_post_id  uuid
) returns table(reaction text, aura_count integer)
language plpgsql security definer
set search_path = public as $$
declare
  v_author_id   uuid;
  v_exists      boolean;
  v_new_count   integer;
  v_given_today integer;
begin
  select user_id into v_author_id from public.forum_posts where id = p_post_id for update;

  if v_author_id is null then
    raise exception 'target not found or has no author';
  end if;
  if v_author_id = p_giver_id then
    raise exception 'self_aura_not_allowed';
  end if;

  select exists(
    select 1 from public.forum_aura where giver_id = p_giver_id and post_id = p_post_id
  ) into v_exists;

  if v_exists then
    -- Já tinha dado aura: desfaz (undo), mesma régua do "clicar de novo" em
    -- comentário.
    delete from public.forum_aura where giver_id = p_giver_id and post_id = p_post_id;

    update public.forum_posts set aura_count = forum_posts.aura_count - 1 where id = p_post_id
      returning forum_posts.aura_count into v_new_count;

    update public.user_aura_wallet
      set balance = greatest(balance - 1, 0), updated_at = now()
      where user_id = v_author_id;

    insert into public.aura_ledger (user_id, delta, reason, source_post_id, giver_id)
    values (v_author_id, -1, 'post_aura_removed', p_post_id, p_giver_id);

    return query select null::text, v_new_count;
  else
    -- Nova reação: consome o mesmo limite diário de 50 "dados" que
    -- comentário usa (ver toggle_forum_aura, 20260804120000_aura_rebalance.sql).
    select count(*) into v_given_today
    from public.aura_ledger
    where giver_id = p_giver_id
      and created_at >= now() - interval '24 hours'
      and reason in (
        'post_aura_received', 'comment_aura_received', 'blog_comment_aura_received',
        'comment_aura_disliked', 'blog_comment_aura_disliked'
      );

    if v_given_today >= 50 then
      raise exception 'daily_aura_limit_reached';
    end if;

    insert into public.forum_aura (giver_id, post_id, kind) values (p_giver_id, p_post_id, 'like');

    update public.forum_posts set aura_count = forum_posts.aura_count + 1 where id = p_post_id
      returning forum_posts.aura_count into v_new_count;

    insert into public.user_aura_wallet (user_id, balance) values (v_author_id, 1)
      on conflict (user_id) do update
        set balance = greatest(user_aura_wallet.balance + 1, 0), updated_at = now();

    insert into public.aura_ledger (user_id, delta, reason, source_post_id, giver_id)
    values (v_author_id, 1, 'post_aura_received', p_post_id, p_giver_id);

    return query select 'like'::text, v_new_count;
  end if;
end;
$$;

revoke execute on function public.toggle_forum_post_aura(uuid, uuid) from public, anon, authenticated;
grant execute on function public.toggle_forum_post_aura(uuid, uuid) to service_role;
