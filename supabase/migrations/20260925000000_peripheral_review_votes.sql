-- Upvote/downvote (estilo Reddit) nas reviews da comunidade de periférico —
-- mutuamente exclusivo por (review, votante), igual ao "BOM OU BAGRE"
-- (`peripheral_votes`/`toggle_peripheral_vote`, 20260830010000), mas por
-- review em vez de por periférico. Sem crédito de Aura pro autor da review
-- aqui — só reordena/destaca reviews por score, mesmo espírito de
-- `peripheral_votes` (o benefício de Aura de votar já é dado 1x/dia via
-- missão diária, na 1ª interação de qualquer tipo).
--
-- IMPORTANTE — aplicar manualmente via Supabase Dashboard (SQL Editor): o
-- histórico de migrations deste projeto está dessincronizado desde 04/08,
-- não rodar via `supabase db push`.

-- ────────────────────────────────────────────
-- 1. peripheral_reviews.score — contagem líquida (upvotes - downvotes),
--    denormalizada pra ordenar/exibir sem contar votes a cada leitura.
-- ────────────────────────────────────────────
alter table public.peripheral_reviews
  add column if not exists score integer not null default 0;

-- ────────────────────────────────────────────
-- 2. peripheral_review_votes
-- ────────────────────────────────────────────
create table if not exists public.peripheral_review_votes (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.peripheral_reviews(id) on delete cascade,
  voter_id   uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  unique (review_id, voter_id)
);

create index if not exists idx_peripheral_review_votes_review on public.peripheral_review_votes (review_id);

alter table public.peripheral_review_votes enable row level security;
-- Sem policy de select pública: contagem (via `peripheral_reviews.score`) e o
-- voto do próprio usuário são sempre lidos via service role nas rotas de API,
-- mesmo padrão de `peripheral_votes`.

-- ────────────────────────────────────────────
-- 3. toggle_peripheral_review_vote — like/dislike por review, mutuamente
--    exclusivo. Mesmo idioma de `toggle_peripheral_vote`, mas atualiza o
--    `score` denormalizado na própria review em vez de contar na hora.
-- ────────────────────────────────────────────
create or replace function public.toggle_peripheral_review_vote(
  p_voter_id  uuid,
  p_review_id uuid,
  p_kind      text
) returns table(reaction text, score integer)
language plpgsql security definer
set search_path = public as $$
declare
  v_existing_kind text;
  v_delta         integer;
  v_new_score     integer;
begin
  if p_kind not in ('like', 'dislike') then
    raise exception 'invalid kind';
  end if;

  if not exists (select 1 from public.peripheral_reviews where id = p_review_id and is_hidden = false) then
    raise exception 'target not found';
  end if;

  select prv.kind into v_existing_kind
  from public.peripheral_review_votes prv where prv.voter_id = p_voter_id and prv.review_id = p_review_id;

  if v_existing_kind is null then
    insert into public.peripheral_review_votes (voter_id, review_id, kind) values (p_voter_id, p_review_id, p_kind);
    perform public.complete_daily_mission(p_voter_id, 'aura');
    v_delta := case when p_kind = 'like' then 1 else -1 end;
  elsif v_existing_kind = p_kind then
    delete from public.peripheral_review_votes prv where prv.voter_id = p_voter_id and prv.review_id = p_review_id;
    v_delta := case when p_kind = 'like' then -1 else 1 end;
    p_kind := null;
  else
    update public.peripheral_review_votes prv set kind = p_kind where prv.voter_id = p_voter_id and prv.review_id = p_review_id;
    v_delta := case when p_kind = 'like' then 2 else -2 end;
  end if;

  update public.peripheral_reviews pr
    set score = pr.score + v_delta
    where pr.id = p_review_id
    returning pr.score into v_new_score;

  return query select p_kind, v_new_score;
end;
$$;

revoke execute on function public.toggle_peripheral_review_vote(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_peripheral_review_vote(uuid, uuid, text) to service_role;
