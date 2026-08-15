-- "Mini Reviews" no perfil do usuário — Parte 1 da tarefa de Reviews da
-- Comunidade. Cria `peripheral_reviews` (nota 1-5 com meia-estrela + texto
-- opcional até 400 chars, 1 por usuário por periférico), o termo de
-- integridade (timestamp de aceite em `user_profiles`) e a aura fixa de +10
-- por criar uma review.
--
-- NÃO mexe em `peripheral_comments`/`peripheral_votes`/`peripheral_aura`
-- (20260830010000) — o vote box "BOM OU BAGRE" e os comentários da página do
-- periférico continuam como estão; a substituição por estrelas é a Parte 2.
--
-- IMPORTANTE — aplicar manualmente via Supabase Dashboard (SQL Editor): o
-- histórico de migrations deste projeto está dessincronizado desde 04/08,
-- não rodar via `supabase db push`.

-- ────────────────────────────────────────────
-- 1. peripheral_reviews
-- ────────────────────────────────────────────
create table if not exists public.peripheral_reviews (
  id             uuid primary key default gen_random_uuid(),
  peripheral_id  uuid not null references public.peripherals(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- Nota geral, 1.0-5.0 em passos de meia estrela (1, 1.5, 2, 2.5 ... 5).
  rating         numeric(2,1) not null
    check (rating >= 1 and rating <= 5 and (rating * 2) = floor(rating * 2)),
  -- Texto opcional (até 400 chars) — review sem texto ainda conta pra média
  -- de estrelas (Parte 2), mas não vira "card com texto" na página do
  -- periférico.
  body           text
    check (body is null or char_length(body) <= 400),
  body_preview   text generated always as (left(body, 140)) stored,
  has_text       boolean generated always as (body is not null and length(btrim(body)) > 0) stored,
  -- Reservado pra moderação (Parte 3, ex.: violação do termo de integridade).
  -- O "excluir" do próprio usuário é hard delete, não passa por aqui — ver
  -- nota da idempotência de aura mais abaixo.
  is_hidden      boolean not null default false,
  edited_at      timestamptz,
  is_edited      boolean generated always as (edited_at is not null) stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, peripheral_id)
);

-- Antecipa a agregação de média de estrelas da Parte 2.
create index if not exists idx_peripheral_reviews_peripheral
  on public.peripheral_reviews (peripheral_id) where is_hidden = false;

-- Alimenta "Meus Reviews" no perfil.
create index if not exists idx_peripheral_reviews_user_created
  on public.peripheral_reviews (user_id, created_at desc) where is_hidden = false;

alter table public.peripheral_reviews enable row level security;

-- Review é conteúdo público — leitura liberada pra qualquer client; toda
-- escrita passa pelas rotas de API com a service role (mesmo padrão de
-- peripheral_comments: sem policy de insert/update/delete pro client direto).
drop policy if exists "Peripheral reviews are publicly readable" on public.peripheral_reviews;
create policy "Peripheral reviews are publicly readable"
  on public.peripheral_reviews for select
  using (is_hidden = false);

-- ────────────────────────────────────────────
-- 2. user_profiles — aceite do termo de integridade (item 1.2 do spec).
--    Registrado uma vez, nunca mais exibido depois de preenchido; usado
--    futuramente pela moderação (Parte 3).
-- ────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists reviews_integrity_accepted_at timestamptz;

-- ────────────────────────────────────────────
-- 3. aura_ledger — nova coluna de origem + amplia o whitelist de `reason`.
-- ────────────────────────────────────────────
alter table public.aura_ledger
  add column if not exists source_peripheral_review_id uuid references public.peripheral_reviews(id) on delete set null;

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
    'post_created', 'comment_created', 'blog_comment_created',
    'daily_mission_completed', 'daily_streak_bonus', 'achievement_unlocked',
    'peripheral_comment_aura_received', 'peripheral_comment_aura_removed',
    'peripheral_comment_aura_disliked', 'peripheral_comment_aura_undisliked',
    'peripheral_comment_created',
    'peripheral_review_created'
  ));

-- Idempotência do bônus fixo de +10 por avaliar — chaveada em
-- `source_peripheral_id`, NÃO em `source_peripheral_review_id`: o "excluir"
-- do usuário é hard delete (libera o slot único de peripheral_reviews), então
-- recriar uma review pro mesmo periférico gera um id novo. Se a idempotência
-- fosse pelo id da review, delete+recriar creditaria +10 de novo (farm). Pelo
-- `source_peripheral_id` (que sobrevive, o registro do ledger nunca é
-- apagado), o bônus é garantidamente 1x por (usuário, periférico) pra sempre.
create unique index if not exists aura_ledger_peripheral_review_created_unique
  on public.aura_ledger (user_id, source_peripheral_id)
  where reason = 'peripheral_review_created';

-- ────────────────────────────────────────────
-- 4. credit_peripheral_review_creation_aura — +10 fixo por criar uma review,
--    1x por (usuário, periférico) pra sempre (nunca de novo em edição, nem
--    depois de excluir+recriar — ver nota do índice acima). Mesmo idioma de
--    credit_peripheral_comment_creation_aura (20260830010000).
-- ────────────────────────────────────────────
create or replace function public.credit_peripheral_review_creation_aura(
  p_user_id       uuid,
  p_peripheral_id uuid,
  p_review_id     uuid
) returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_inserted integer;
  v_credited integer;
begin
  v_credited := public.apply_aura_gain(p_user_id, 10);

  insert into public.aura_ledger (user_id, delta, reason, source_peripheral_id, source_peripheral_review_id)
  values (p_user_id, v_credited, 'peripheral_review_created', p_peripheral_id, p_review_id)
  on conflict (user_id, source_peripheral_id) where reason = 'peripheral_review_created' do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    -- Já premiado antes: desfaz o crédito que apply_aura_gain já aplicou na
    -- wallet, já que o ledger (fonte da verdade de idempotência) não gravou.
    update public.user_aura_wallet
      set balance = greatest(balance - v_credited, 0), updated_at = now()
      where user_id = p_user_id;
    return false;
  end if;

  return true;
end;
$$;

revoke execute on function public.credit_peripheral_review_creation_aura(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.credit_peripheral_review_creation_aura(uuid, uuid, uuid) to service_role;
