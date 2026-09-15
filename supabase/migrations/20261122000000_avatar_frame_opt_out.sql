-- "Nenhuma moldura" passa a ser uma ESCOLHA, e não a ausência de escolha.
--
-- O BUG
-- -----
-- `equipped_avatar_frame_id is null` significava duas coisas ao mesmo tempo:
-- "ainda não escolhi" e "escolhi não usar nenhuma". Como `resolveProfileFrame`
-- cai no fallback de honraria quando o slot está vazio (Fundador > VIP >
-- Ofensiva), clicar em "Nenhuma" no editor de perfil gravava `null`, a rota
-- respondia ok — e o avatar continuava com a moldura de Fundador no site
-- inteiro. Do ponto de vista de quem clicou, o botão simplesmente não
-- funcionava.
--
-- POR QUE UMA COLUNA, E NÃO UM ITEM "NENHUMA" NO CATÁLOGO
-- -------------------------------------------------------
-- Um item-sentinela em `aura_items` exigiria conceder a posse dele para TODO
-- mundo (senão `equipAvatarFrame` recusa por falta de linha em
-- `user_aura_items`), e cada consulta que hoje faz join com o item equipado
-- passaria a ter de tratar um id mágico. A escolha é do PERFIL, não um item
-- que se possui: ela mora em `user_profiles`, ao lado do slot que ela
-- qualifica.
--
-- POR QUE `false` É O DEFAULT CERTO
-- ---------------------------------
-- Quem nunca mexeu no seletor continua vendo a honraria que conquistou — a
-- precedência do módulo (`lib/profile-frames.ts`) segue valendo, e o backfill
-- de Fundador/Ofensiva que equipou molduras em slot vazio não é desfeito.
-- Só quem clicar em "Nenhuma" de propósito passa a ter o avatar limpo.
alter table public.user_profiles
  add column if not exists avatar_frame_opt_out boolean not null default false;

comment on column public.user_profiles.avatar_frame_opt_out is
  'O dono escolheu NÃO exibir moldura nenhuma. Diferente de equipped_avatar_frame_id null (= nunca escolheu), que ainda cai no fallback de honraria (Fundador/VIP/Ofensiva) em resolveProfileFrame.';

-- Equipar qualquer moldura cancela o opt-out: são a mesma decisão ("o que eu
-- exibo"), e deixar os dois de pé faria alguém equipar uma moldura e não ver
-- nada mudar — o mesmo bug de novo, ao contrário. Um trigger, e não uma regra
-- na rota, porque o slot é escrito por `equipAvatarFrame` E pelos backfills de
-- migration; a trava tem de valer para os dois.
create or replace function public.clear_frame_opt_out_on_equip()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.equipped_avatar_frame_id is not null
     and new.equipped_avatar_frame_id is distinct from old.equipped_avatar_frame_id then
    new.avatar_frame_opt_out := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_frame_opt_out on public.user_profiles;

create trigger trg_clear_frame_opt_out
  before update of equipped_avatar_frame_id on public.user_profiles
  for each row execute function public.clear_frame_opt_out_on_equip();
