-- Dois ajustes no toggle de aura (20260806_forum_aura.sql), pedidos depois
-- de ver o botão em uso:
--
-- 1. `aura_count` (o número exibido no botão) subia/descia de 1 em 1
--    enquanto o "+10" flutuante (AuraButton.tsx) e o saldo da wallet já
--    valiam 10 — o contador visível precisa refletir o mesmo valor, senão
--    a animação parece quebrada. Passa a mover ±10 junto com a wallet.
-- 2. Limite de 50 auras dadas por dia por usuário, pra existir algum custo
--    de oportunidade (sem isso, dar aura é infinito e o saldo em
--    aura_ledger não significa nada). Só entra na conta quem DÁ aura —
--    remover não consome nem devolve o limite do dia. Conta pelo
--    aura_ledger (histórico append-only) e não pelo forum_aura (que só
--    guarda o estado atual e cicla dar/tirar sem deixar rastro).
create or replace function public.toggle_forum_aura(
  p_giver_id    uuid,
  p_target_type text, -- 'post' | 'comment'
  p_target_id   uuid
) returns table(given boolean, aura_count integer)
language plpgsql security definer
set search_path = public as $$
declare
  v_author_id        uuid;
  v_exists           boolean;
  v_new_count        integer;
  v_given_today      integer;
begin
  if p_target_type not in ('post', 'comment') then
    raise exception 'invalid target_type';
  end if;

  if p_target_type = 'post' then
    select user_id into v_author_id from public.forum_posts where id = p_target_id for update;
  else
    select user_id into v_author_id from public.forum_comments where id = p_target_id for update;
  end if;

  if v_author_id is null then
    raise exception 'target not found or has no author';
  end if;
  if v_author_id = p_giver_id then
    raise exception 'self_aura_not_allowed';
  end if;

  if p_target_type = 'post' then
    select exists(
      select 1 from public.forum_aura where giver_id = p_giver_id and post_id = p_target_id
    ) into v_exists;
  else
    select exists(
      select 1 from public.forum_aura where giver_id = p_giver_id and comment_id = p_target_id
    ) into v_exists;
  end if;

  if v_exists then
    if p_target_type = 'post' then
      delete from public.forum_aura where giver_id = p_giver_id and post_id = p_target_id;
      update public.forum_posts set aura_count = greatest(forum_posts.aura_count - 10, 0) where id = p_target_id
        returning forum_posts.aura_count into v_new_count;
    else
      delete from public.forum_aura where giver_id = p_giver_id and comment_id = p_target_id;
      update public.forum_comments set aura_count = greatest(forum_comments.aura_count - 10, 0) where id = p_target_id
        returning forum_comments.aura_count into v_new_count;
    end if;

    update public.user_aura_wallet
      set balance = greatest(balance - 10, 0), updated_at = now()
      where user_id = v_author_id;

    insert into public.aura_ledger (user_id, delta, reason, source_post_id, source_comment_id, giver_id)
    values (
      v_author_id, -10,
      case when p_target_type = 'post' then 'post_aura_removed' else 'comment_aura_removed' end,
      case when p_target_type = 'post' then p_target_id end,
      case when p_target_type = 'comment' then p_target_id end,
      p_giver_id
    );

    return query select false, v_new_count;
  else
    select count(*) into v_given_today
    from public.aura_ledger
    where giver_id = p_giver_id
      and delta > 0
      and created_at >= now() - interval '24 hours';

    if v_given_today >= 50 then
      raise exception 'daily_aura_limit_reached';
    end if;

    if p_target_type = 'post' then
      insert into public.forum_aura (giver_id, post_id) values (p_giver_id, p_target_id);
      update public.forum_posts set aura_count = forum_posts.aura_count + 10 where id = p_target_id
        returning forum_posts.aura_count into v_new_count;
    else
      insert into public.forum_aura (giver_id, comment_id) values (p_giver_id, p_target_id);
      update public.forum_comments set aura_count = forum_comments.aura_count + 10 where id = p_target_id
        returning forum_comments.aura_count into v_new_count;
    end if;

    insert into public.user_aura_wallet (user_id, balance) values (v_author_id, 10)
      on conflict (user_id) do update set balance = user_aura_wallet.balance + 10, updated_at = now();

    insert into public.aura_ledger (user_id, delta, reason, source_post_id, source_comment_id, giver_id)
    values (
      v_author_id, 10,
      case when p_target_type = 'post' then 'post_aura_received' else 'comment_aura_received' end,
      case when p_target_type = 'post' then p_target_id end,
      case when p_target_type = 'comment' then p_target_id end,
      p_giver_id
    );

    return query select true, v_new_count;
  end if;
end;
$$;
