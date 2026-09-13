-- Vínculo entre um tópico do fórum e os periféricos citados nele.
--
-- Motivo: o fórum e o catálogo são os dois maiores acervos de conteúdo do
-- site e não tinham UM link interno entre si. Um tópico "qual mouse pegar"
-- cita "ATK U2 V2 Mini" em texto puro, e nem a ficha do periférico sabia que
-- a discussão existe, nem o post apontava para a ficha. Esta tabela é o que
-- permite o card "Periféricos citados" no post e o bloco "Discussões no
-- fórum" na ficha — interlinking que hoje não existe.
--
-- Só POSTS, não comentários: comentário não tem URL própria, então não gera
-- valor de indexação, e seriam ~773 linhas sem destino. O texto dos
-- comentários pode, num passo futuro, alimentar o vínculo do post-pai.
--
-- O vínculo é gravado pelas rotas do Next (service role), que rodam o mesmo
-- detector do cliente sobre o texto salvo — o cliente nunca é fonte de
-- verdade. Por isso NÃO há policy de escrita para anon/authenticated e o
-- grant de escrita é revogado, seguindo 20261109000000 e 20261110000000:
-- service role tem rolbypassrls e não é afetado.

create table if not exists public.forum_post_peripherals (
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  peripheral_id uuid not null references public.peripherals(id) on delete cascade,
  -- 'auto'    = detectado ao publicar/editar
  -- 'manual'  = o autor confirmou/adicionou no formulário
  -- 'backfill' = script one-off sobre o acervo antigo
  source text not null default 'auto' check (source in ('auto', 'manual', 'backfill')),
  created_at timestamptz not null default now(),
  primary key (post_id, peripheral_id)
);

-- Caminho da ficha do periférico -> posts que o citam ("Discussões no fórum").
-- A PK já cobre o sentido post -> periféricos.
create index if not exists idx_forum_post_peripherals_peripheral
  on public.forum_post_peripherals (peripheral_id, created_at desc);

alter table public.forum_post_peripherals enable row level security;

-- Leitura pública: a tabela só liga dois conteúdos que já são públicos.
-- (Postgres não tem `create policy if not exists`.)
drop policy if exists "forum_post_peripherals_select_public" on public.forum_post_peripherals;
create policy "forum_post_peripherals_select_public"
  on public.forum_post_peripherals
  for select
  using (true);

-- Escrita só por service role: sem policy de INSERT/UPDATE/DELETE e sem grant.
revoke insert, update, delete on public.forum_post_peripherals from anon, authenticated;
grant select on public.forum_post_peripherals to anon, authenticated;
