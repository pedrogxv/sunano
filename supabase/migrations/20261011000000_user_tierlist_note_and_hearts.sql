-- Tierlist pessoal (VIP, Beta): recado curto do dono + corações do público.
--
-- Duas coisas nascem aqui:
--
-- 1. `user_tierlist_meta.note` — um mini comentário que o próprio dono deixa
--    na tierlist dele ("por que o S é esse", "testei tudo em 2026"...). É
--    tabela à parte de `user_tierlist_items` porque o recado é da tierlist
--    inteira, não de um item; guardar em `user_profiles` misturaria uma coisa
--    de feature VIP com o perfil base.
--
-- 2. `user_tierlist_hearts` — qualquer pessoa logada pode dar um coração na
--    tierlist de outra. É deliberadamente uma tabela de junção (user dono ×
--    user que curtiu) e não um contador solto: sem a linha não dá pra impedir
--    o mesmo visitante de curtir mil vezes, nem mostrar "você já curtiu".
--
-- A contagem fica desnormalizada em `user_tierlist_meta.hearts_count`,
-- mantida por trigger — o preview da tierlist aparece em toda visita de
-- perfil, e um `count(*)` por visita numa tabela que só cresce é justamente o
-- tipo de full-scan que já custou caro aqui antes.

create table if not exists public.user_tierlist_meta (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  note         text,
  hearts_count integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.user_tierlist_meta
  add column if not exists note text;
alter table public.user_tierlist_meta
  add column if not exists hearts_count integer not null default 0;

-- 280 caracteres: é "mini comentário", não uma segunda bio. O limite também
-- vale na API (zod) — aqui é a defesa de última linha.
alter table public.user_tierlist_meta
  drop constraint if exists user_tierlist_meta_note_length;
alter table public.user_tierlist_meta
  add constraint user_tierlist_meta_note_length
  check (note is null or char_length(note) <= 280);

create table if not exists public.user_tierlist_hearts (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, user_id),
  -- Coração é reconhecimento de terceiro; curtir a própria tierlist infla o
  -- número sem dizer nada.
  constraint user_tierlist_hearts_not_self check (owner_id <> user_id)
);

-- Para "quantas tierlists essa pessoa curtiu" e para o `on delete cascade`
-- do lado de quem curtiu não varrer a tabela inteira.
create index if not exists idx_user_tierlist_hearts_user
  on public.user_tierlist_hearts(user_id);

-- Contador desnormalizado: a trigger é a única escritora de `hearts_count`.
create or replace function public.sync_user_tierlist_hearts_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.user_tierlist_meta (user_id, hearts_count)
    values (new.owner_id, 1)
    on conflict (user_id) do update
      set hearts_count = public.user_tierlist_meta.hearts_count + 1,
          updated_at = now();
    return new;
  end if;

  update public.user_tierlist_meta
    set hearts_count = greatest(hearts_count - 1, 0),
        updated_at = now()
    where user_id = old.owner_id;
  return old;
end;
$$;

drop trigger if exists trg_user_tierlist_hearts_count on public.user_tierlist_hearts;
create trigger trg_user_tierlist_hearts_count
  after insert or delete on public.user_tierlist_hearts
  for each row execute function public.sync_user_tierlist_hearts_count();

alter table public.user_tierlist_meta enable row level security;
alter table public.user_tierlist_hearts enable row level security;

-- Leitura pública das duas: o recado e a contagem aparecem no perfil de
-- qualquer visitante, e o "você já curtiu" precisa ler a linha do coração.
drop policy if exists "Tierlist meta is publicly readable" on public.user_tierlist_meta;
create policy "Tierlist meta is publicly readable"
  on public.user_tierlist_meta for select using (true);

drop policy if exists "Tierlist hearts are publicly readable" on public.user_tierlist_hearts;
create policy "Tierlist hearts are publicly readable"
  on public.user_tierlist_hearts for select using (true);

-- Escrever o recado: mesma regra dos itens — só o dono, e só com VIP ativo.
-- Rebaixar de VIP congela o recado (continua visível, não editável), igual ao
-- que já acontece com os itens da tierlist.
drop policy if exists "VIP users can manage their own tierlist meta" on public.user_tierlist_meta;
create policy "VIP users can manage their own tierlist meta"
  on public.user_tierlist_meta for all
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid() and public.is_vip_active(p.account_tier, p.vip_expires_at)
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid() and public.is_vip_active(p.account_tier, p.vip_expires_at)
    )
  );

-- Dar coração: qualquer pessoa logada (não é feature VIP — VIP é montar a
-- tierlist, não reagir à dos outros), sempre em nome de si mesma.
drop policy if exists "Users can heart other tierlists" on public.user_tierlist_hearts;
create policy "Users can heart other tierlists"
  on public.user_tierlist_hearts for insert
  to authenticated
  with check (auth.uid() = user_id and auth.uid() <> owner_id);

drop policy if exists "Users can remove their own heart" on public.user_tierlist_hearts;
create policy "Users can remove their own heart"
  on public.user_tierlist_hearts for delete
  to authenticated
  using (auth.uid() = user_id);
