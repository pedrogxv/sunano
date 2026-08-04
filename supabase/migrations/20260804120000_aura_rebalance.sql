-- Rebalanceamento do sistema de Aura (pedido do produto):
--
--   1. Criar postagem no fórum: +10 Aura, 1x/dia por usuário.
--   2. Comentar (fórum ou notícia): +5 Aura, 1x por post/notícia por usuário.
--   3. Receber like: +1 Aura para o autor (era +10 — único tipo de reação
--      que existia até aqui, ver 20260806_forum_aura.sql / 20260810_forum_aura_10x_and_daily_limit.sql).
--   4. Receber dislike (novo): -1 Aura para o autor.
--
-- Histórico (wallets/aura_ledger/aura_count já acumulados na escala antiga
-- de +10) não é reescrito — só o comportamento daqui pra frente muda.
--
-- `forum_aura` ganha `kind` ('like'|'dislike'). Como já é 1 linha por
-- (giver, target) com unique constraints, isso automaticamente torna
-- like/dislike mutuamente exclusivos: dar dislike em algo que você já tinha
-- dado like troca a linha (e vice-versa), nunca duplica.

alter table public.forum_aura
  add column if not exists kind text not null default 'like';

alter table public.forum_aura drop constraint if exists forum_aura_kind_check;
alter table public.forum_aura
  add constraint forum_aura_kind_check check (kind in ('like', 'dislike'));

-- Idempotência do bônus de "comentar" (1x por post/notícia por usuário):
-- índice único parcial em aura_ledger, no mesmo espírito do
-- `on conflict do nothing` de `claim_event_medal` (20260804_events.sql) —
-- histórico append-only, então deletar/recriar o comentário no mesmo post
-- não libera o bônus de novo (a linha do ledger continua existindo).
create unique index if not exists aura_ledger_comment_created_unique
  on public.aura_ledger (user_id, source_post_id)
  where reason = 'comment_created';

create unique index if not exists aura_ledger_blog_comment_created_unique
  on public.aura_ledger (user_id, source_blog_post_id)
  where reason = 'blog_comment_created';

alter table public.aura_ledger
  drop constraint if exists aura_ledger_reason_check,
  add constraint aura_ledger_reason_check check (reason in (
    'post_aura_received', 'post_aura_removed',
    'comment_aura_received', 'comment_aura_removed',
    'event_medal_redeemed',
    'blog_post_aura_received', 'blog_post_aura_removed',
    'blog_comment_aura_received', 'blog_comment_aura_removed',
    'post_aura_disliked', 'post_aura_undisliked',
    'comment_aura_disliked', 'comment_aura_undisliked',
    'blog_post_aura_disliked', 'blog_post_aura_undisliked',
    'blog_comment_aura_disliked', 'blog_comment_aura_undisliked',
    'post_created', 'comment_created', 'blog_comment_created'
  ));

-- ────────────────────────────────────────────
-- toggle_forum_aura: ganha um 4º argumento (p_kind, 'like'|'dislike') e
-- passa a devolver `reaction` ('like' | 'dislike' | null) em vez de
-- `given boolean` — sinaliza pra troca de retorno via drop (create or
-- replace não permite mudar o formato das colunas de retorno).
--
-- Efeito no autor por ação:
--   dar like            -> +1   (reason post_aura_received)
--   tirar like           -> -1   (reason post_aura_removed)
--   dar dislike           -> -1   (reason post_aura_disliked)
--   tirar dislike        -> +1   (reason post_aura_undisliked)
--   trocar like->dislike -> -2   (post_aura_removed seguido de post_aura_disliked)
--   trocar dislike->like -> +2   (post_aura_undisliked seguido de post_aura_received)
-- (mesma coisa para comment/blog_post/blog_comment, trocando o prefixo)
--
-- `aura_count` (post/comentário) deixa de ter piso em 0 — precisa refletir
-- o placar líquido (likes - dislikes) e isso pode ser negativo. O piso em 0
-- continua só no saldo total do usuário (`user_aura_wallet.balance`, via
-- `greatest(...)`), que é o comportamento que já existia e não foi pedido
-- pra mudar.
--
-- Limite diário de 50 "dados" (like ou dislike, dar ou trocar — não conta
-- remoção) continua existindo, só passou a contar por `reason` em vez de
-- `delta > 0` (dislike dado tem delta negativo no autor, mas ainda consome
-- o limite de quem deu).
-- ────────────────────────────────────────────
drop function if exists public.toggle_forum_aura(uuid, text, uuid);

create or replace function public.toggle_forum_aura(
  p_giver_id    uuid,
  p_target_type text, -- 'post' | 'comment' | 'blog_post' | 'blog_comment'
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
  if p_target_type not in ('post', 'comment', 'blog_post', 'blog_comment') then
    raise exception 'invalid target_type';
  end if;
  if p_kind not in ('like', 'dislike') then
    raise exception 'invalid kind';
  end if;

  if p_target_type = 'post' then
    select user_id into v_author_id from public.forum_posts where id = p_target_id for update;
  elsif p_target_type = 'comment' then
    select user_id into v_author_id from public.forum_comments where id = p_target_id for update;
  elsif p_target_type = 'blog_post' then
    select author_id into v_author_id from public.blog_posts where id = p_target_id for update;
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
    when 'post' then 'post_aura_received' when 'comment' then 'comment_aura_received'
    when 'blog_post' then 'blog_post_aura_received' else 'blog_comment_aura_received' end;
  v_removed_reason    := case p_target_type
    when 'post' then 'post_aura_removed' when 'comment' then 'comment_aura_removed'
    when 'blog_post' then 'blog_post_aura_removed' else 'blog_comment_aura_removed' end;
  v_disliked_reason   := case p_target_type
    when 'post' then 'post_aura_disliked' when 'comment' then 'comment_aura_disliked'
    when 'blog_post' then 'blog_post_aura_disliked' else 'blog_comment_aura_disliked' end;
  v_undisliked_reason := case p_target_type
    when 'post' then 'post_aura_undisliked' when 'comment' then 'comment_aura_undisliked'
    when 'blog_post' then 'blog_post_aura_undisliked' else 'blog_comment_aura_undisliked' end;

  if p_target_type = 'post' then
    select kind into v_existing_kind from public.forum_aura where giver_id = p_giver_id and post_id = p_target_id;
  elsif p_target_type = 'comment' then
    select kind into v_existing_kind from public.forum_aura where giver_id = p_giver_id and comment_id = p_target_id;
  elsif p_target_type = 'blog_post' then
    select kind into v_existing_kind from public.forum_aura where giver_id = p_giver_id and blog_post_id = p_target_id;
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
        'post_aura_received', 'comment_aura_received', 'blog_post_aura_received', 'blog_comment_aura_received',
        'post_aura_disliked', 'comment_aura_disliked', 'blog_post_aura_disliked', 'blog_comment_aura_disliked'
      );

    if v_given_today >= 50 then
      raise exception 'daily_aura_limit_reached';
    end if;

    if p_target_type = 'post' then
      insert into public.forum_aura (giver_id, post_id, kind) values (p_giver_id, p_target_id, p_kind);
    elsif p_target_type = 'comment' then
      insert into public.forum_aura (giver_id, comment_id, kind) values (p_giver_id, p_target_id, p_kind);
    elsif p_target_type = 'blog_post' then
      insert into public.forum_aura (giver_id, blog_post_id, kind) values (p_giver_id, p_target_id, p_kind);
    else
      insert into public.forum_aura (giver_id, blog_comment_id, kind) values (p_giver_id, p_target_id, p_kind);
    end if;

    v_count_delta := case when p_kind = 'like' then 1 else -1 end;
    v_ledger_reason := case when p_kind = 'like' then v_received_reason else v_disliked_reason end;

    insert into public.aura_ledger (user_id, delta, reason, source_post_id, source_comment_id, source_blog_post_id, source_blog_comment_id, giver_id)
    values (
      v_author_id, v_count_delta, v_ledger_reason,
      case when p_target_type = 'post' then p_target_id end,
      case when p_target_type = 'comment' then p_target_id end,
      case when p_target_type = 'blog_post' then p_target_id end,
      case when p_target_type = 'blog_comment' then p_target_id end,
      p_giver_id
    );

    insert into public.user_aura_wallet (user_id, balance) values (v_author_id, greatest(v_count_delta, 0))
      on conflict (user_id) do update
        set balance = greatest(user_aura_wallet.balance + v_count_delta, 0), updated_at = now();

  elsif v_existing_kind = p_kind then
    -- Mesma reação de novo: desfaz (undo).
    if p_target_type = 'post' then
      delete from public.forum_aura where giver_id = p_giver_id and post_id = p_target_id;
    elsif p_target_type = 'comment' then
      delete from public.forum_aura where giver_id = p_giver_id and comment_id = p_target_id;
    elsif p_target_type = 'blog_post' then
      delete from public.forum_aura where giver_id = p_giver_id and blog_post_id = p_target_id;
    else
      delete from public.forum_aura where giver_id = p_giver_id and blog_comment_id = p_target_id;
    end if;

    v_count_delta := case when p_kind = 'like' then -1 else 1 end;
    v_ledger_reason := case when p_kind = 'like' then v_removed_reason else v_undisliked_reason end;

    insert into public.aura_ledger (user_id, delta, reason, source_post_id, source_comment_id, source_blog_post_id, source_blog_comment_id, giver_id)
    values (
      v_author_id, v_count_delta, v_ledger_reason,
      case when p_target_type = 'post' then p_target_id end,
      case when p_target_type = 'comment' then p_target_id end,
      case when p_target_type = 'blog_post' then p_target_id end,
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
        'post_aura_received', 'comment_aura_received', 'blog_post_aura_received', 'blog_comment_aura_received',
        'post_aura_disliked', 'comment_aura_disliked', 'blog_post_aura_disliked', 'blog_comment_aura_disliked'
      );

    if v_given_today >= 50 then
      raise exception 'daily_aura_limit_reached';
    end if;

    if p_target_type = 'post' then
      update public.forum_aura set kind = p_kind where giver_id = p_giver_id and post_id = p_target_id;
    elsif p_target_type = 'comment' then
      update public.forum_aura set kind = p_kind where giver_id = p_giver_id and comment_id = p_target_id;
    elsif p_target_type = 'blog_post' then
      update public.forum_aura set kind = p_kind where giver_id = p_giver_id and blog_post_id = p_target_id;
    else
      update public.forum_aura set kind = p_kind where giver_id = p_giver_id and blog_comment_id = p_target_id;
    end if;

    -- Perna 1: desfaz a reação antiga.
    v_leg_delta := case when v_existing_kind = 'like' then -1 else 1 end;
    v_ledger_reason := case when v_existing_kind = 'like' then v_removed_reason else v_undisliked_reason end;
    insert into public.aura_ledger (user_id, delta, reason, source_post_id, source_comment_id, source_blog_post_id, source_blog_comment_id, giver_id)
    values (
      v_author_id, v_leg_delta, v_ledger_reason,
      case when p_target_type = 'post' then p_target_id end,
      case when p_target_type = 'comment' then p_target_id end,
      case when p_target_type = 'blog_post' then p_target_id end,
      case when p_target_type = 'blog_comment' then p_target_id end,
      p_giver_id
    );

    -- Perna 2: aplica a nova.
    v_leg_delta := case when p_kind = 'like' then 1 else -1 end;
    v_ledger_reason := case when p_kind = 'like' then v_received_reason else v_disliked_reason end;
    insert into public.aura_ledger (user_id, delta, reason, source_post_id, source_comment_id, source_blog_post_id, source_blog_comment_id, giver_id)
    values (
      v_author_id, v_leg_delta, v_ledger_reason,
      case when p_target_type = 'post' then p_target_id end,
      case when p_target_type = 'comment' then p_target_id end,
      case when p_target_type = 'blog_post' then p_target_id end,
      case when p_target_type = 'blog_comment' then p_target_id end,
      p_giver_id
    );

    -- Efeito líquido: -2 (like->dislike) ou +2 (dislike->like) — usado tanto
    -- no saldo do autor quanto no aura_count do post/comentário abaixo.
    v_count_delta := case when p_kind = 'like' then 2 else -2 end;
    update public.user_aura_wallet
      set balance = greatest(balance + v_count_delta, 0), updated_at = now()
      where user_id = v_author_id;
  end if;

  if p_target_type = 'post' then
    update public.forum_posts set aura_count = forum_posts.aura_count + v_count_delta where id = p_target_id
      returning forum_posts.aura_count into v_new_count;
  elsif p_target_type = 'comment' then
    update public.forum_comments set aura_count = forum_comments.aura_count + v_count_delta where id = p_target_id
      returning forum_comments.aura_count into v_new_count;
  elsif p_target_type = 'blog_post' then
    update public.blog_posts set aura_count = blog_posts.aura_count + v_count_delta where id = p_target_id
      returning blog_posts.aura_count into v_new_count;
  else
    update public.blog_comments set aura_count = blog_comments.aura_count + v_count_delta where id = p_target_id
      returning blog_comments.aura_count into v_new_count;
  end if;

  return query select p_kind, v_new_count;
end;
$$;

revoke execute on function public.toggle_forum_aura(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_forum_aura(uuid, text, uuid, text) to service_role;

-- ────────────────────────────────────────────
-- credit_forum_post_creation_aura: +10 pro autor ao criar um post do fórum,
-- no máximo 1x a cada 24h — checado pelo aura_ledger (histórico
-- append-only), então deletar e recriar um post no mesmo dia não libera o
-- bônus de novo. `pg_advisory_xact_lock` serializa tentativas concorrentes
-- do mesmo usuário (não há uma linha natural pra travar com `for update`
-- aqui, diferente do toggle de aura).
-- ────────────────────────────────────────────
create or replace function public.credit_forum_post_creation_aura(
  p_user_id uuid,
  p_post_id uuid
) returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_already_rewarded boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('aura:post_created:' || p_user_id::text, 0));

  select exists(
    select 1 from public.aura_ledger
    where user_id = p_user_id
      and reason = 'post_created'
      and created_at >= now() - interval '24 hours'
  ) into v_already_rewarded;

  if v_already_rewarded then
    return false;
  end if;

  insert into public.aura_ledger (user_id, delta, reason, source_post_id)
  values (p_user_id, 10, 'post_created', p_post_id);

  insert into public.user_aura_wallet (user_id, balance) values (p_user_id, 10)
    on conflict (user_id) do update
      set balance = user_aura_wallet.balance + 10, updated_at = now();

  return true;
end;
$$;

revoke execute on function public.credit_forum_post_creation_aura(uuid, uuid) from public, anon, authenticated;
grant execute on function public.credit_forum_post_creation_aura(uuid, uuid) to service_role;

-- ────────────────────────────────────────────
-- credit_comment_creation_aura: +5 pro autor ao comentar (fórum ou
-- notícia), no máximo 1x por post/notícia por usuário — idempotência via
-- índice único parcial em aura_ledger (aura_ledger_comment_created_unique /
-- aura_ledger_blog_comment_created_unique), mesmo padrão de
-- `on conflict do nothing` + `get diagnostics` de `claim_event_medal`.
-- Responder (parent_comment_id) conta como comentar no post, mesma regra.
-- ────────────────────────────────────────────
create or replace function public.credit_comment_creation_aura(
  p_user_id     uuid,
  p_target_type text, -- 'post' | 'blog_post' (o que foi comentado)
  p_target_id   uuid
) returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_inserted integer;
begin
  if p_target_type not in ('post', 'blog_post') then
    raise exception 'invalid target_type';
  end if;

  if p_target_type = 'post' then
    insert into public.aura_ledger (user_id, delta, reason, source_post_id)
    values (p_user_id, 5, 'comment_created', p_target_id)
    on conflict (user_id, source_post_id) where reason = 'comment_created' do nothing;
  else
    insert into public.aura_ledger (user_id, delta, reason, source_blog_post_id)
    values (p_user_id, 5, 'blog_comment_created', p_target_id)
    on conflict (user_id, source_blog_post_id) where reason = 'blog_comment_created' do nothing;
  end if;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false;
  end if;

  insert into public.user_aura_wallet (user_id, balance) values (p_user_id, 5)
    on conflict (user_id) do update
      set balance = user_aura_wallet.balance + 5, updated_at = now();

  return true;
end;
$$;

revoke execute on function public.credit_comment_creation_aura(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.credit_comment_creation_aura(uuid, text, uuid) to service_role;
