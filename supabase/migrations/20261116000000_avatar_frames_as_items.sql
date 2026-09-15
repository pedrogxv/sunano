-- Recuperado de supabase_migrations.schema_migrations (aplicada em produção
-- sem o arquivo correspondente no repo). Conteúdo exatamente o que rodou no
-- banco; não re-executa, a versão já consta como aplicada no remoto.

-- Molduras de avatar como ITEM DE USUÁRIO, e não mais `if` fixo no código.
--
-- O QUE MUDA
-- ----------
-- Antes só a moldura COMPRÁVEL era um item (`aura_items.kind='avatar_frame'`,
-- posse em `user_aura_items`, slot em `user_profiles.equipped_avatar_frame_id`).
-- As outras duas molduras que o site desenha — a do VIP e a do pódio — não
-- existiam no banco: eram `if isVip` e `if place <= 3` espalhados por
-- componente, cada tela com a sua cor. Ver `lib/profile-frames.ts`.
--
-- Esta migration dá a elas o MESMO modelo de dado das compráveis, para que
-- passar a conceder posse de verdade (e deixar o usuário escolher qual
-- equipar entre as que tem) não exija nova migration nem mudança de
-- componente — só passar a inserir linhas em `user_aura_items`.
--
-- O QUE NÃO MUDA
-- --------------
-- O CAMINHO do resgate é o mesmo: `redeem_aura_item` é recriada com o corpo
-- vigente (20261006000000) intacto, só com uma recusa a mais logo após o
-- SELECT — item cuja `acquisition` não é `purchase` levanta
-- `item_not_purchasable` antes de tocar posse, carteira ou histórico.
-- Nenhuma outra RPC é tocada.
--
-- A ARTE continua no código (mesmo modelo de `lib/mini-profile-backgrounds.ts`):
-- o banco guarda identidade, posse e slot; o desenho de cada moldura mora em
-- `lib/profile-frames.ts`, amarrado pelo `slug`. Item sem arte no código =
-- avatar sem moldura (degradação suave), nunca tela quebrada.

-- ────────────────────────────────────────────
-- 1. Como a moldura é obtida
-- ────────────────────────────────────────────
-- `purchase` — resgatada com Aura (é o comportamento de hoje, e o default
--              para não mexer em nenhuma linha existente).
-- `vip`      — vem junto da assinatura ativa.
-- `rank`     — concedida pela colocação no placar histórico.
-- `grant`    — concedida à mão pelo admin (evento, brinde, compensação).
alter table public.aura_items
  add column if not exists acquisition text not null default 'purchase';

alter table public.aura_items
  drop constraint if exists aura_items_acquisition_check;

alter table public.aura_items
  add constraint aura_items_acquisition_check
    check (acquisition in ('purchase', 'vip', 'rank', 'grant'));

comment on column public.aura_items.acquisition is
  'Como o item é obtido. Só `purchase` passa por `redeem_aura_item`/Aura; os demais são concedidos pelo sistema (VIP, ranking) ou pelo admin. Ver lib/profile-frames.ts.';

-- `aura_cost > 0` era o único preço possível, o que impedia representar uma
-- moldura que não se compra. Agora o preço é obrigatório apenas para quem de
-- fato é comprável — o resto grava 0.
alter table public.aura_items
  drop constraint if exists aura_items_aura_cost_check;

alter table public.aura_items
  add constraint aura_items_aura_cost_check
    check (
      case
        when acquisition = 'purchase' then aura_cost > 0
        else aura_cost >= 0
      end
    );

-- ────────────────────────────────────────────
-- 2. Item não-comprável não passa pelo caixa
-- ────────────────────────────────────────────
-- Trava no nível da RPC, não só da UI: sem isso um POST direto em
-- /api/aura/items/<id>/redeem com o id de uma moldura de rank concederia a
-- posse dela por Aura, contornando o mérito inteiro.
--
-- Corpo idêntico ao de 20261006000000_aura_purchases_history.sql (que segue
-- sendo a referência do resgate: posse + débito + `aura_purchases` na mesma
-- transação), MAIS a leitura de `acquisition` e a recusa logo após o SELECT.
create or replace function public.redeem_aura_item(p_user_id uuid, p_item_id uuid)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_aura_cost      integer;
  v_active         boolean;
  v_slug           text;
  v_name           text;
  v_kind           text;
  v_acquisition    text;
  v_inserted       integer;
  v_account_tier   text;
  v_vip_expires_at timestamptz;
  v_is_vip         boolean;
  v_final_cost     integer;
  v_balance_before integer;
begin
  select aura_cost, active, slug, name, kind, acquisition
    into v_aura_cost, v_active, v_slug, v_name, v_kind, v_acquisition
  from public.aura_items
  where id = p_item_id
  for update;

  if not found or not v_active then
    return false;
  end if;

  -- Moldura de VIP/rank/brinde não tem preço e não se compra: quem concede é
  -- o sistema (ou o admin), inserindo direto em `user_aura_items`.
  if v_acquisition <> 'purchase' then
    raise exception 'item_not_purchasable';
  end if;

  insert into public.user_aura_items (user_id, item_id)
  values (p_user_id, p_item_id)
  on conflict (user_id, item_id) do nothing;

  get diagnostics v_inserted = row_count;

  -- Já possuía o item (clique duplicado/retry): não cobra de novo.
  if v_inserted = 0 then
    return true;
  end if;

  select account_tier, vip_expires_at into v_account_tier, v_vip_expires_at
  from public.user_profiles
  where id = p_user_id;

  v_is_vip := public.is_vip_active(v_account_tier, v_vip_expires_at);
  v_final_cost := case when v_is_vip then round(v_aura_cost * 0.9)::integer else v_aura_cost end;

  select balance into v_balance_before
  from public.user_aura_wallet
  where user_id = p_user_id
  for update;

  update public.user_aura_wallet
  set balance = balance - v_final_cost, updated_at = now()
  where user_id = p_user_id and balance >= v_final_cost;

  if not found then
    raise exception 'insufficient_aura_balance';
  end if;

  insert into public.aura_ledger (user_id, delta, reason)
  values (p_user_id, -v_final_cost, 'aura_item_redeemed');

  insert into public.aura_purchases (
    user_id, item_id, item_slug, item_name, item_kind,
    list_price, amount_paid, vip_discount_applied, balance_before, balance_after
  ) values (
    p_user_id, p_item_id, v_slug, v_name, v_kind,
    v_aura_cost, v_final_cost, v_is_vip, v_balance_before, v_balance_before - v_final_cost
  );

  return true;
end;
$$;

revoke execute on function public.redeem_aura_item(uuid, uuid) from public, anon, authenticated;

grant execute on function public.redeem_aura_item(uuid, uuid) to service_role;

-- ────────────────────────────────────────────
-- 3. Catálogo das molduras concedidas
-- ────────────────────────────────────────────
-- Os slugs são EXATAMENTE os de `lib/profile-frames.ts` (`vip`,
-- `rank:<board>:<place>`) — é o slug que liga a linha do banco à arte no
-- código. Trocar um sem trocar o outro deixa a moldura sem desenho.
--
-- `active = false`: elas não entram na vitrine de itens compráveis da Central
-- (a seção "Molduras" as mostra à parte, a partir do catálogo em código).
-- A linha existe para que a POSSE tenha onde apontar quando o sistema passar
-- a concedê-la.
insert into public.aura_items
  (slug, name, description, kind, image_url, frame_asset_url, aura_cost, acquisition, active, sort_order)
values
  ('vip', 'Moldura VIP',
   'Exclusiva de quem assina o VIP. Acompanha a assinatura — não se compra com Aura.',
   'avatar_frame', null, null, 0, 'vip', false, 900),

  ('rank:aura:1', '1º em Aura', 'Concedida a quem está em 1º lugar no ranking de aura de todos os tempos.',
   'avatar_frame', null, null, 0, 'rank', false, 910),
  ('rank:aura:2', '2º em Aura', 'Concedida a quem está em 2º lugar no ranking de aura de todos os tempos.',
   'avatar_frame', null, null, 0, 'rank', false, 911),
  ('rank:aura:3', '3º em Aura', 'Concedida a quem está em 3º lugar no ranking de aura de todos os tempos.',
   'avatar_frame', null, null, 0, 'rank', false, 912),

  ('rank:followers:1', '1º em Seguidores', 'Concedida a quem está em 1º lugar no ranking de seguidores de todos os tempos.',
   'avatar_frame', null, null, 0, 'rank', false, 920),
  ('rank:followers:2', '2º em Seguidores', 'Concedida a quem está em 2º lugar no ranking de seguidores de todos os tempos.',
   'avatar_frame', null, null, 0, 'rank', false, 921),
  ('rank:followers:3', '3º em Seguidores', 'Concedida a quem está em 3º lugar no ranking de seguidores de todos os tempos.',
   'avatar_frame', null, null, 0, 'rank', false, 922),

  ('rank:activity:1', '1º em Atividade', 'Concedida a quem está em 1º lugar no ranking de atividade de todos os tempos.',
   'avatar_frame', null, null, 0, 'rank', false, 930),
  ('rank:activity:2', '2º em Atividade', 'Concedida a quem está em 2º lugar no ranking de atividade de todos os tempos.',
   'avatar_frame', null, null, 0, 'rank', false, 931),
  ('rank:activity:3', '3º em Atividade', 'Concedida a quem está em 3º lugar no ranking de atividade de todos os tempos.',
   'avatar_frame', null, null, 0, 'rank', false, 932),

  ('rank:streak:1', '1º em Ofensiva', 'Concedida a quem está em 1º lugar no ranking de ofensiva de todos os tempos.',
   'avatar_frame', null, null, 0, 'rank', false, 940),
  ('rank:streak:2', '2º em Ofensiva', 'Concedida a quem está em 2º lugar no ranking de ofensiva de todos os tempos.',
   'avatar_frame', null, null, 0, 'rank', false, 941),
  ('rank:streak:3', '3º em Ofensiva', 'Concedida a quem está em 3º lugar no ranking de ofensiva de todos os tempos.',
   'avatar_frame', null, null, 0, 'rank', false, 942)
on conflict (slug) do nothing;
