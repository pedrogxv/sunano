-- Post não recebe mais like/dislike — só comentário.
--
-- Complementa 20260804120000_aura_rebalance.sql, que definiu o balanceamento
-- (postar +10 1x/dia, comentar +5 1x por post, like +1, dislike -1). A regra
-- de reação ficou valendo só para comentário: quem posta é premiado por
-- postar, não julgado — a ideia é incentivar mais posts, e um post não pode
-- render aura negativa pro autor.
--
-- O front já não expõe reação em post (os endpoints POST de aura de post e de
-- notícia foram removidos); isto fecha a porta no banco também, para uma rota
-- futura não reabrir o comportamento sem querer.
--
-- Histórico não é reescrito: as reações já dadas em posts continuam em
-- `forum_aura`, o aura já creditado continua em `aura_ledger` /
-- `user_aura_wallet`, e `forum_posts.aura_count` / `blog_posts.aura_count`
-- ficam congelados no último valor (nenhuma tela lê mais essas colunas).

-- ────────────────────────────────────────────
-- toggle_forum_aura: mesma função de 20260804120000, com um único ajuste —
-- `p_target_type` passa a aceitar só 'comment' | 'blog_comment'. Os ramos de
-- post/blog_post saíram junto (nada mais os alcança), o que também remove os
-- reasons *_post_aura_* do caminho de escrita; eles seguem permitidos no
-- check de `aura_ledger` porque o histórico já gravado precisa continuar
-- válido.
-- ────────────────────────────────────────────
create or replace function public.toggle_forum_aura(
  p_giver_id    uuid,
  p_target_type text, -- 'comment' | 'blog_comment'
  p_target_id   uuid,
  p_kind        text default 'like' -- 'like' | 'dislike'
) returns table(reaction text, aura_count integer)
language plpgsql security definer
set search_path = public as $$
declare
  v_author_id         uuid;
  v_existing_kind     text;
  v_new_count         integer;
  v_given_today       integer;
  v_received_reason   text;
  v_removed_reason    text;
  v_disliked_reason   text;
  v_undisliked_reason text;
  v_leg_delta         integer;
  v_count_delta       integer;
  v_ledger_reason     text;
begin
  if p_target_type not in ('comment', 'blog_comment') then
    raise exception 'invalid target_type';
  end if;
  if p_kind not in ('like', 'dislike') then
    raise exception 'invalid kind';
  end if;

  if p_target_type = 'comment' then
    select user_id into v_author_id from public.forum_comments where id = p_target_id for update;
  else
    select user_id into v_author_id from public.blog_comments where id = p_target_id for update;
  end if;

  if v_author_id is null then
    raise exception 'target not found or has no author';
  end if;
  if v_author_id = p_giver_id then
    raise exception 'self_aura_not_allowed';
  end if;

  v_received_reason   := case p_target_type
    when 'comment' then 'comment_aura_received' else 'blog_comment_aura_received' end;
  v_removed_reason    := case p_target_type
    when 'comment' then 'comment_aura_removed' else 'blog_comment_aura_removed' end;
  v_disliked_reason   := case p_target_type
    when 'comment' then 'comment_aura_disliked' else 'blog_comment_aura_disliked' end;
  v_undisliked_reason := case p_target_type
    when 'comment' then 'comment_aura_undisliked' else 'blog_comment_aura_undisliked' end;

  if p_target_type = 'comment' then
    select kind into v_existing_kind from public.forum_aura where giver_id = p_giver_id and comment_id = p_target_id;
  else
    select kind into v_existing_kind from public.forum_aura where giver_id = p_giver_id and blog_comment_id = p_target_id;
  end if;

  if v_existing_kind is null then
    -- Nova reação: consome o limite diário de "dados".
    select count(*) into v_given_today
    from public.aura_ledger
    where giver_id = p_giver_id
      and created_at >= now() - interval '24 hours'
      and reason in (
        'comment_aura_received', 'blog_comment_aura_received',
        'comment_aura_disliked', 'blog_comment_aura_disliked'
      );

    if v_given_today >= 50 then
      raise exception 'daily_aura_limit_reached';
    end if;

    if p_target_type = 'comment' then
      insert into public.forum_aura (giver_id, comment_id, kind) values (p_giver_id, p_target_id, p_kind);
    else
      insert into public.forum_aura (giver_id, blog_comment_id, kind) values (p_giver_id, p_target_id, p_kind);
    end if;

    v_count_delta := case when p_kind = 'like' then 1 else -1 end;
    v_ledger_reason := case when p_kind = 'like' then v_received_reason else v_disliked_reason end;

    insert into public.aura_ledger (user_id, delta, reason, source_comment_id, source_blog_comment_id, giver_id)
    values (
      v_author_id, v_count_delta, v_ledger_reason,
      case when p_target_type = 'comment' then p_target_id end,
      case when p_target_type = 'blog_comment' then p_target_id end,
      p_giver_id
    );

    insert into public.user_aura_wallet (user_id, balance) values (v_author_id, greatest(v_count_delta, 0))
      on conflict (user_id) do update
        set balance = greatest(user_aura_wallet.balance + v_count_delta, 0), updated_at = now();

  elsif v_existing_kind = p_kind then
    -- Mesma reação de novo: desfaz (undo).
    if p_target_type = 'comment' then
      delete from public.forum_aura where giver_id = p_giver_id and comment_id = p_target_id;
    else
      delete from public.forum_aura where giver_id = p_giver_id and blog_comment_id = p_target_id;
    end if;

    v_count_delta := case when p_kind = 'like' then -1 else 1 end;
    v_ledger_reason := case when p_kind = 'like' then v_removed_reason else v_undisliked_reason end;

    insert into public.aura_ledger (user_id, delta, reason, source_comment_id, source_blog_comment_id, giver_id)
    values (
      v_author_id, v_count_delta, v_ledger_reason,
      case when p_target_type = 'comment' then p_target_id end,
      case when p_target_type = 'blog_comment' then p_target_id end,
      p_giver_id
    );

    update public.user_aura_wallet
      set balance = greatest(balance + v_count_delta, 0), updated_at = now()
      where user_id = v_author_id;

    p_kind := null; -- devolvido como `reaction` = null (nenhuma reação ativa)

  else
    -- Trocando like<->dislike: consome o limite diário (mesma régua de uma
    -- reação nova) e grava as duas pernas no ledger (desfaz a antiga, aplica
    -- a nova) pra manter o extrato auditável.
    select count(*) into v_given_today
    from public.aura_ledger
    where giver_id = p_giver_id
      and created_at >= now() - interval '24 hours'
      and reason in (
        'comment_aura_received', 'blog_comment_aura_received',
        'comment_aura_disliked', 'blog_comment_aura_disliked'
      );

    if v_given_today >= 50 then
      raise exception 'daily_aura_limit_reached';
    end if;

    if p_target_type = 'comment' then
      update public.forum_aura set kind = p_kind where giver_id = p_giver_id and comment_id = p_target_id;
    else
      update public.forum_aura set kind = p_kind where giver_id = p_giver_id and blog_comment_id = p_target_id;
    end if;

    -- Perna 1: desfaz a reação antiga.
    v_leg_delta := case when v_existing_kind = 'like' then -1 else 1 end;
    v_ledger_reason := case when v_existing_kind = 'like' then v_removed_reason else v_undisliked_reason end;
    insert into public.aura_ledger (user_id, delta, reason, source_comment_id, source_blog_comment_id, giver_id)
    values (
      v_author_id, v_leg_delta, v_ledger_reason,
      case when p_target_type = 'comment' then p_target_id end,
      case when p_target_type = 'blog_comment' then p_target_id end,
      p_giver_id
    );

    -- Perna 2: aplica a nova.
    v_leg_delta := case when p_kind = 'like' then 1 else -1 end;
    v_ledger_reason := case when p_kind = 'like' then v_received_reason else v_disliked_reason end;
    insert into public.aura_ledger (user_id, delta, reason, source_comment_id, source_blog_comment_id, giver_id)
    values (
      v_author_id, v_leg_delta, v_ledger_reason,
      case when p_target_type = 'comment' then p_target_id end,
      case when p_target_type = 'blog_comment' then p_target_id end,
      p_giver_id
    );

    -- Efeito líquido: -2 (like->dislike) ou +2 (dislike->like) — usado tanto
    -- no saldo do autor quanto no aura_count do comentário abaixo.
    v_count_delta := case when p_kind = 'like' then 2 else -2 end;
    update public.user_aura_wallet
      set balance = greatest(balance + v_count_delta, 0), updated_at = now()
      where user_id = v_author_id;
  end if;

  if p_target_type = 'comment' then
    update public.forum_comments set aura_count = forum_comments.aura_count + v_count_delta where id = p_target_id
      returning forum_comments.aura_count into v_new_count;
  else
    update public.blog_comments set aura_count = blog_comments.aura_count + v_count_delta where id = p_target_id
      returning blog_comments.aura_count into v_new_count;
  end if;

  return query select p_kind, v_new_count;
end;
$$;

revoke execute on function public.toggle_forum_aura(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_forum_aura(uuid, text, uuid, text) to service_role;
