-- Fundos de Mini Perfil — cosmético comprável na Central de Aura, no conceito
-- de "Profile Background" da Steam.
--
-- Um fundo é um TEMA ANIMADO do cartão de Mini Perfil (o preview que abre ao
-- passar o mouse num avatar). A arte de cada tema é 100% CSS e mora no código
-- (`lib/mini-profile-backgrounds.ts`), amarrada por `slug` — por isso
-- `image_url`/`frame_asset_url` ficam vazios aqui, do mesmo jeito que o
-- `streak_shield` já faz (20261004000000).
--
-- Reaproveita inteiro o caminho de compra que já existe: kind novo em
-- `aura_items`, posse em `user_aura_items`, e a MESMA RPC `redeem_aura_item`
-- (que já debita com desconto VIP e grava em `aura_purchases` desde
-- 20261006000000 / 20261012000000). Zero RPC nova — só o kind, a coluna de
-- equipado e o seed.
--
-- O equipar é uma coluna própria (`equipped_mini_profile_bg_id`) e não um
-- reuso de `equipped_avatar_frame_id`: moldura de avatar e fundo do cartão
-- são slots independentes, o usuário pode ter os dois ao mesmo tempo.

-- ────────────────────────────────────────────
-- 1. Novo kind no catálogo
-- ────────────────────────────────────────────
alter table public.aura_items
  drop constraint if exists aura_items_kind_check;
alter table public.aura_items
  add constraint aura_items_kind_check check (kind in (
    'avatar_frame', 'vip_month', 'display_name_change', 'streak_shield', 'mini_profile_bg'
  ));

-- ────────────────────────────────────────────
-- 2. Slot equipado no perfil
-- ────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists equipped_mini_profile_bg_id uuid
    references public.aura_items(id) on delete set null;

comment on column public.user_profiles.equipped_mini_profile_bg_id is
  'Item de kind=mini_profile_bg equipado como tema do cartão de Mini Perfil (deve estar em user_aura_items do mesmo usuário — reforçado na aplicação, como equipped_avatar_frame_id).';

-- O cartão de Mini Perfil é carregado por slug para QUALQUER visitante
-- (/api/users/mini-profile), então o join precisa alcançar o slug do item
-- equipado — `aura_items` já é publicamente legível ("Aura items are publicly
-- readable"), e a única coluna nova exposta aqui é o id do item equipado, que
-- é cosmético e público por natureza (aparece desenhado no cartão).
create index if not exists idx_user_profiles_equipped_mini_bg
  on public.user_profiles(equipped_mini_profile_bg_id)
  where equipped_mini_profile_bg_id is not null;

-- ────────────────────────────────────────────
-- 3. Seed dos 9 fundos — 3 por faixa de preço
--    Os slugs são a chave para `MINI_PROFILE_BG_THEMES` em
--    lib/mini-profile-backgrounds.ts. Renomear um slug aqui sem renomear lá
--    faz o cartão perder o efeito (degradação suave, não erro).
--    `sort_order` alto pra cair depois dos itens utilitários já existentes.
-- ────────────────────────────────────────────
insert into public.aura_items (slug, name, description, kind, image_url, frame_asset_url, aura_cost, active, sort_order)
values
  -- Raro — 50
  ('fundo-mini-perfil-brasa',          'Fundo: Brasa',          'Fagulhas subindo sobre um degradê de fogo baixo.',                    'mini_profile_bg', null, '',  50, true, 10),
  ('fundo-mini-perfil-mare',           'Fundo: Maré',           'Véu de água-marinha ondulando devagar.',                              'mini_profile_bg', null, '',  50, true, 11),
  ('fundo-mini-perfil-terminal',       'Fundo: Terminal',       'Varredura de monitor antigo em verde-fósforo.',                       'mini_profile_bg', null, '',  50, true, 12),
  -- Épico — 150
  ('fundo-mini-perfil-nebulosa',       'Fundo: Nebulosa',       'Poeira estelar à deriva com brilho holográfico correndo.',            'mini_profile_bg', null, '', 150, true, 20),
  ('fundo-mini-perfil-tempestade',     'Fundo: Tempestade',     'Raios cortando nuvens carregadas de eletricidade.',                   'mini_profile_bg', null, '', 150, true, 21),
  ('fundo-mini-perfil-abismo',         'Fundo: Abismo',         'Correntes de bioluminescência subindo do fundo do mar.',              'mini_profile_bg', null, '', 150, true, 22),
  -- Lendário — 350
  ('fundo-mini-perfil-supernova',      'Fundo: Supernova',      'Raios de luz irrompendo, brasas em órbita e borda prismática.',       'mini_profile_bg', null, '', 350, true, 30),
  ('fundo-mini-perfil-singularidade',  'Fundo: Singularidade',  'Horizonte de eventos girando, com relâmpagos presos na órbita.',      'mini_profile_bg', null, '', 350, true, 31),
  ('fundo-mini-perfil-aurora-real',    'Fundo: Aurora Real',    'Cortina de aurora boreal com poeira de ouro e brilho real.',          'mini_profile_bg', null, '', 350, true, 32)
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  kind        = excluded.kind,
  aura_cost   = excluded.aura_cost,
  sort_order  = excluded.sort_order;
