-- O bloco fixo "Periféricos sem mistério" volta ao carrossel da Home como um
-- slide a mais — mas administrável como os outros: ativa/desativa e reordena
-- pelo painel /admin/banners. Conteúdo (título, botões, mascote) continua
-- fixo no componente React; só a presença/posição dele no carrossel é dado.
--
-- `kind` distingue esse slide especial (sem imagem própria) dos banners de
-- imagem normais. Só pode existir um `hero` — é um singleton, nunca criado
-- pelo painel.

alter table public.home_banners
  add column if not exists kind text not null default 'image';

alter table public.home_banners
  drop constraint if exists home_banners_kind_check;
alter table public.home_banners
  add constraint home_banners_kind_check
  check (kind in ('image', 'hero'));

comment on column public.home_banners.kind is
  '''image'' = banner de imagem normal (padrão). ''hero'' = o bloco fixo "Periféricos sem mistério"; conteúdo vem do componente React, não do banco — só existe uma linha desse tipo.';

-- Banner de imagem continua exigindo imagem; o hero não tem uma.
alter table public.home_banners
  alter column image_url drop not null;

alter table public.home_banners
  drop constraint if exists home_banners_image_url_required_check;
alter table public.home_banners
  add constraint home_banners_image_url_required_check
  check (kind <> 'image' or image_url is not null);

-- No máximo uma linha `hero` — é o singleton do bloco fixo, não um tipo de
-- banner que o painel deixa criar em série.
create unique index if not exists home_banners_single_hero_idx
  on public.home_banners (kind)
  where kind = 'hero';

-- Semeia o hero se ainda não existir (idempotente — seguro rodar de novo).
-- Entra no início da fila (menor sort_order) e ativo, reproduzindo o
-- comportamento anterior de aparecer sempre em primeiro quando havia banners.
insert into public.home_banners (kind, image_url, alt_text, is_active, sort_order)
select
  'hero',
  null,
  'Periféricos sem mistério — destaque padrão da Home',
  true,
  coalesce((select min(sort_order) - 1 from public.home_banners), 0)
where not exists (
  select 1 from public.home_banners where kind = 'hero'
);
