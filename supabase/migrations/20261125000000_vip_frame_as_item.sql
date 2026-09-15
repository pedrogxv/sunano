-- Moldura VIP vira item POSSUÍDO, como qualquer outra.
--
-- O QUE MUDA
-- ----------
-- Até aqui a moldura de VIP era a única que NINGUÉM possuía: não havia linha
-- em `user_aura_items` para o slug `vip`, e ela aparecia no avatar só pelo
-- fallback de precedência de `resolveProfileFrame` (`if (isVip) return
-- VIP_FRAME`). Consequência direta na tela: `getFrameCollection` a marcava
-- `equippable: false` de propósito, porque um "Equipar" ali bateria em
-- `equipAvatarFrame` e voltaria 403 "você ainda não possui este item".
--
-- Na prática isso criava um caso especial sem motivo. Um assinante que
-- equipasse QUALQUER outra moldura (uma cosmética, um marco de ofensiva)
-- perdia o acesso à de VIP: ela não estava no slot, e o fallback só roda
-- quando o slot está vazio. A moldura que ele paga para ter virava a única
-- que ele não conseguia escolher de volta.
--
-- Agora ela é item normal: posse em `user_aura_items`, concedida pelos mesmos
-- triggers que já concedem a de Fundador, e equipável pelo mesmo caminho das
-- outras. Quem vira VIP com o slot VAZIO tem a moldura equipada junto — para
-- que o assinante novo continue vendo o anel sem precisar descobrir o
-- seletor —, mas quem já escolheu outra coisa NÃO é sobrescrito: a escolha do
-- dono ganha de tudo, que é a precedência de sempre.
--
-- A EXIBIÇÃO CONTINUA EXPIRANDO COM A ASSINATURA
-- -----------------------------------------------
-- A posse é permanente (não apagamos a linha quando o VIP vence), mas
-- `isFrameEntitled` em `lib/profile-frames.ts` já confere `isVip` antes de
-- desenhar uma moldura equipada de `source: "vip"`. Então o ex-assinante
-- mantém a linha, para de exibir o anel no dia em que vence, e volta a
-- exibi-lo sozinho se re-assinar — sem nenhum backfill de limpeza. É o mesmo
-- mecanismo que impede uma posse concedida por engano de virar o privilégio.
--
-- Este arquivo é irmão de `20261118000000_vip_founder_frame.sql`: mesma
-- estrutura (item → função de concessão → triggers → backfill), sem a janela
-- de prazo, porque a de VIP é concedida para sempre a quem assinar.

-- ────────────────────────────────────────────
-- 1. O item no catálogo
-- ────────────────────────────────────────────
-- Já existe desde `20261116000000_avatar_frames_as_items.sql`; o `on conflict`
-- só garante `acquisition = 'vip'` (nunca comprável com Aura — `redeem_aura_item`
-- levanta `item_not_purchasable` para tudo que não é `purchase`) e
-- `active = false` (fora da vitrine de compráveis; a Central a mostra à parte).
--
-- `frame_asset_url` fica nulo: a arte é anel desenhado em código
-- (`VIP_FRAME` em `lib/profile-frames.ts`), casada pelo SLUG.
insert into public.aura_items
  (slug, name, description, kind, image_url, frame_asset_url, aura_cost, acquisition, active, sort_order)
values
  ('vip', 'Moldura VIP',
   'Exclusiva de quem assina o VIP. Acompanha a assinatura — não se compra com Aura.',
   'avatar_frame', null, null, 0, 'vip', false, 900)
on conflict (slug) do update
  set name        = excluded.name,
      description = excluded.description,
      acquisition = excluded.acquisition,
      kind        = excluded.kind,
      active      = excluded.active,
      sort_order  = excluded.sort_order;

-- ────────────────────────────────────────────
-- 2. Concessão idempotente (+ auto-equipar no slot vazio)
-- ────────────────────────────────────────────
-- Uma função só para o trigger e o backfill, para que as duas concessões não
-- divirjam — mesma razão de `grant_vip_founder_frame`.
--
-- `p_equip_if_empty` existe porque os dois chamadores querem coisas
-- diferentes: virar VIP agora deve acender o anel na hora (o assinante não
-- deveria precisar achar o seletor para ver o que comprou), enquanto o
-- backfill mexe em gente que já tem o site do jeito que gosta.
--
-- Devolve `true` só quando a posse foi criada AGORA.
create or replace function public.grant_vip_frame(
  p_user_id uuid,
  p_equip_if_empty boolean default true
)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_item_id  uuid;
  v_inserted integer;
begin
  select id into v_item_id from public.aura_items where slug = 'vip';
  if v_item_id is null then
    return false;
  end if;

  -- `do nothing`: renovar, reativar e re-assinar passam por aqui várias
  -- vezes. A posse é uma só, e `acquired_at` guarda a PRIMEIRA vez.
  insert into public.user_aura_items (user_id, item_id)
  values (p_user_id, v_item_id)
  on conflict (user_id, item_id) do nothing;

  get diagnostics v_inserted = row_count;

  -- Só equipa em slot VAZIO e sem opt-out — sobrescrever a escolha do dono
  -- contraria a própria precedência ("a equipada ganha de tudo"), e forçar a
  -- moldura em quem clicou "Nenhuma" desfaz um pedido explícito. É a mesma
  -- trava do backfill de Fundador (`20261119000000`).
  if p_equip_if_empty then
    update public.user_profiles
    set equipped_avatar_frame_id = v_item_id
    where id = p_user_id
      and equipped_avatar_frame_id is null
      and coalesce(avatar_frame_opt_out, false) = false;
  end if;

  return v_inserted > 0;
end;
$$;

comment on function public.grant_vip_frame(uuid, boolean) is
  'Concede a Moldura VIP (posse permanente) e, se o slot estiver vazio, equipa. Idempotente. Chamada pelos triggers de user_profiles e pelo backfill.';

revoke execute on function public.grant_vip_frame(uuid, boolean) from public, anon, authenticated;

grant execute on function public.grant_vip_frame(uuid, boolean) to service_role;

-- ────────────────────────────────────────────
-- 3. Os gatilhos: virou VIP, ganhou
-- ────────────────────────────────────────────
-- Mesma justificativa do Fundador: o VIP é concedido por SEIS caminhos
-- (cartão, PIX, renovação, reativação, compra com Aura, concessão do admin) e
-- o único ponto por onde todos passam é a escrita de `account_tier`/
-- `vip_expires_at` em `user_profiles`. Pendurar a concessão numa RPC deixaria
-- de fora o caminho que ninguém lembrou.
--
-- AFTER, e portanto depois do trigger anti-escalação
-- (`trg_guard_user_profiles_privileged`, BEFORE): um UPDATE forjado por
-- cliente é revertido antes de chegar aqui.
create or replace function public.on_user_becomes_vip_grant_vip_frame()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if public.is_vip_active(new.account_tier, new.vip_expires_at)
     and not public.is_vip_active(old.account_tier, old.vip_expires_at) then
    perform public.grant_vip_frame(new.id, true);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_grant_vip_frame on public.user_profiles;

create trigger trg_grant_vip_frame
  after update of account_tier, vip_expires_at on public.user_profiles
  for each row execute function public.on_user_becomes_vip_grant_vip_frame();

-- INSERT: conta que já nasce VIP (só service_role consegue).
create or replace function public.on_user_inserted_vip_grant_vip_frame()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if public.is_vip_active(new.account_tier, new.vip_expires_at) then
    perform public.grant_vip_frame(new.id, true);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_grant_vip_frame_insert on public.user_profiles;

create trigger trg_grant_vip_frame_insert
  after insert on public.user_profiles
  for each row execute function public.on_user_inserted_vip_grant_vip_frame();

-- ────────────────────────────────────────────
-- 4. Backfill — quem JÁ assina (e quem já assinou)
-- ────────────────────────────────────────────
-- Concede a POSSE a todo mundo que tem VIP ativo agora. Sem isto, a moldura
-- sairia equipável só para quem assinasse DEPOIS do deploy, e o assinante
-- atual continuaria com o botão morto que esta migration veio remover.
--
-- NÃO equipa ninguém (`p_equip_if_empty => false`): quem já assina hoje já vê
-- o anel pelo fallback de precedência, então equipar não mudaria nada visível
-- — mas mexeria no slot de milhares de perfis para um efeito nulo, e tiraria
-- do fallback quem hoje cai nele de propósito. A migration 5 abaixo trata o
-- fallback com cuidado.
--
-- Ex-assinantes ficam de fora: a moldura é "acompanha a assinatura", então a
-- posse só nasce de uma assinatura que existiu depois desta migration ou está
-- viva agora. Quem voltar, ganha pelo trigger.
do $$
declare
  v_item_id uuid;
  v_count   integer;
begin
  select id into v_item_id from public.aura_items where slug = 'vip';
  if v_item_id is null then
    raise exception 'Item vip não encontrado — a inserção do catálogo falhou.';
  end if;

  insert into public.user_aura_items (user_id, item_id)
  select p.id, v_item_id
  from public.user_profiles p
  where public.is_vip_active(p.account_tier, p.vip_expires_at)
  on conflict (user_id, item_id) do nothing;

  get diagnostics v_count = row_count;
  raise notice 'Moldura VIP concedida a % assinantes no backfill.', v_count;
end $$;
