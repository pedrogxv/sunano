-- Sistema de "Aura" do fórum — substitui o upvote/downvote de forum_votes
-- por um like único (dar/remover aura). Diferente de um like comum, aura
-- também credita um saldo pessoal no autor do post/comentário (+10 por
-- aura dada, -10 ao remover), pensado para trocar por medalhas/itens de
-- loja no futuro (a troca em si é fora de escopo aqui — só o saldo e o
-- extrato). `forum_posts.aura_count` / `forum_comments.aura_count`
-- continuam contando pessoas (±1), não pontos — é o que aparece no botão.

alter table public.forum_posts    add column if not exists aura_count integer not null default 0;
alter table public.forum_comments add column if not exists aura_count integer not null default 0;

-- Uma linha por (doador, alvo). `post_id`/`comment_id` são mutuamente
-- exclusivos — o `check` garante exatamente um preenchido, e os dois
-- `unique` só pegam as linhas do seu tipo (Postgres não aplica unicidade em
-- colunas NULL), então não precisa de tabela separada por tipo de alvo.
create table if not exists public.forum_aura (
  id         uuid primary key default gen_random_uuid(),
  giver_id   uuid not null references auth.users(id) on delete cascade,
  post_id    uuid references public.forum_posts(id) on delete cascade,
  comment_id uuid references public.forum_comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint forum_aura_single_target check (
    (post_id is not null and comment_id is null) or
    (post_id is null and comment_id is not null)
  ),
  unique (giver_id, post_id),
  unique (giver_id, comment_id)
);

create index if not exists idx_forum_aura_post
  on public.forum_aura (post_id) where post_id is not null;
create index if not exists idx_forum_aura_comment
  on public.forum_aura (comment_id) where comment_id is not null;
create index if not exists idx_forum_aura_giver
  on public.forum_aura (giver_id);

alter table public.forum_aura enable row level security;

drop policy if exists "Users manage their own aura" on public.forum_aura;
create policy "Users manage their own aura"
  on public.forum_aura for all
  using (auth.uid() = giver_id)
  with check (auth.uid() = giver_id);

create table if not exists public.user_aura_wallet (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.user_aura_wallet enable row level security;

drop policy if exists "Users read their own aura wallet" on public.user_aura_wallet;
create policy "Users read their own aura wallet"
  on public.user_aura_wallet for select using (auth.uid() = user_id);

create table if not exists public.aura_ledger (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  delta             integer not null,
  reason            text not null check (reason in (
                      'post_aura_received', 'post_aura_removed',
                      'comment_aura_received', 'comment_aura_removed'
                    )),
  source_post_id    uuid references public.forum_posts(id) on delete set null,
  source_comment_id uuid references public.forum_comments(id) on delete set null,
  giver_id          uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_aura_ledger_user on public.aura_ledger (user_id, created_at desc);

alter table public.aura_ledger enable row level security;

drop policy if exists "Users read their own aura ledger" on public.aura_ledger;
create policy "Users read their own aura ledger"
  on public.aura_ledger for select using (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- Toggle atômico de aura (dar/remover). Mesma postura de claim_event_medal
-- (20260804_events.sql): SECURITY DEFINER, e o `select ... for update` na
-- própria linha do post/comentário serializa concorrência sem precisar de
-- advisory lock adicional.
-- ────────────────────────────────────────────
create or replace function public.toggle_forum_aura(
  p_giver_id    uuid,
  p_target_type text, -- 'post' | 'comment'
  p_target_id   uuid
) returns table(given boolean, aura_count integer)
language plpgsql security definer
set search_path = public as $$
declare
  v_author_id uuid;
  v_exists    boolean;
  v_new_count integer;
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
      update public.forum_posts set aura_count = forum_posts.aura_count - 1 where id = p_target_id
        returning forum_posts.aura_count into v_new_count;
    else
      delete from public.forum_aura where giver_id = p_giver_id and comment_id = p_target_id;
      update public.forum_comments set aura_count = forum_comments.aura_count - 1 where id = p_target_id
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
    if p_target_type = 'post' then
      insert into public.forum_aura (giver_id, post_id) values (p_giver_id, p_target_id);
      update public.forum_posts set aura_count = forum_posts.aura_count + 1 where id = p_target_id
        returning forum_posts.aura_count into v_new_count;
    else
      insert into public.forum_aura (giver_id, comment_id) values (p_giver_id, p_target_id);
      update public.forum_comments set aura_count = forum_comments.aura_count + 1 where id = p_target_id
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

revoke execute on function public.toggle_forum_aura(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.toggle_forum_aura(uuid, text, uuid) to service_role;
