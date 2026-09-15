-- Recuperado de supabase_migrations.schema_migrations (aplicada em produção
-- sem o arquivo correspondente no repo). Conteúdo exatamente o que rodou no
-- banco; não re-executa, a versão já consta como aplicada no remoto.

-- Moldura de Fundador — honraria de quem assinou o VIP na janela de lançamento.
--
-- O QUE É
-- -------
-- Quem tem VIP ativo ANTES de 2026-10-01 00:00 (horário de Brasília) ganha a
-- moldura `vip:founder` como POSSE de verdade em `user_aura_items`. Fechada a
-- janela, ninguém mais recebe: a moldura não volta a ser concedida nem entra
-- na loja. Quem já ganhou mantém para sempre, inclusive depois de cancelar a
-- assinatura — é o que "fundador" significa, e é o que torna a janela um
-- incentivo real em vez de mais um benefício alugado.
--
-- POR QUE UM TRIGGER, E NÃO UM `if` EM CADA RPC
-- ---------------------------------------------
-- O VIP é concedido por SEIS caminhos diferentes: cartão
-- (`activate_vip_subscription`), PIX (`activate_vip_subscription_pix`),
-- renovação (`renew_vip_subscription`), reativação
-- (`reactivate_vip_subscription`), compra com Aura (`purchase_vip_with_aura`)
-- e concessão manual pelo admin (UPDATE direto com service_role). Espalhar a
-- concessão por todos eles garante que um caminho fique de fora — e o que
-- ficar de fora só aparece como "assinei e não ganhei" no suporte, depois da
-- janela fechada, quando não dá mais para conceder sem abrir exceção.
--
-- O único ponto por onde TODOS passam é a escrita de `account_tier = 'vip'`
-- em `user_profiles`. O trigger mora lá.
--
-- A ARTE fica no código (`lib/profile-frames.ts`, slug `vip:founder`), mesmo
-- modelo das outras molduras: o banco guarda identidade e posse, o código
-- guarda o desenho. A DATA-LIMITE está nos dois lados e precisa bater —
-- `VIP_FOUNDER_DEADLINE` no TS decide o que a interface mostra, este arquivo
-- decide quem de fato recebe. A do banco é a que vale.

-- ────────────────────────────────────────────
-- 1. O item no catálogo
-- ────────────────────────────────────────────
-- `acquisition = 'grant'`: não se compra com Aura em hipótese alguma —
-- `redeem_aura_item` levanta `item_not_purchasable` para tudo que não é
-- `purchase` (ver 20261116000000). Quem concede é o trigger abaixo.
--
-- `active = false`: fora da vitrine de itens compráveis. A seção "Molduras"
-- da Central de Aura a mostra à parte, a partir do catálogo em código.
--
-- `frame_asset_url = null` de propósito: a moldura é anel desenhado em código
-- (âmbar + estrela), não um PNG. `resolveProfileFrame` a identifica pelo
-- SLUG, não pela URL.
insert into public.aura_items
  (slug, name, description, kind, image_url, frame_asset_url, aura_cost, acquisition, active, sort_order)
values
  ('vip:founder', 'Moldura Fundador',
   'Exclusiva de quem assinou o VIP até 1º de outubro de 2026. Encerrada a janela, não volta a ser concedida — e fica com você mesmo que a assinatura acabe.',
   'avatar_frame', null, null, 0, 'grant', false, 890)
on conflict (slug) do update
  set name        = excluded.name,
      description = excluded.description,
      acquisition = excluded.acquisition,
      kind        = excluded.kind,
      sort_order  = excluded.sort_order;

-- ────────────────────────────────────────────
-- 2. A janela, em um lugar só
-- ────────────────────────────────────────────
-- Função imutável para que o prazo não fique copiado entre o trigger e o
-- backfill. `-03:00` explícito: `'2026-10-01'::timestamptz` seria lido no
-- fuso do servidor (UTC no Supabase), encerrando a promoção às 21h do dia 30
-- para quem está no Brasil — três horas de assinantes pagantes de fora, sem
-- explicação.
create or replace function public.vip_founder_deadline()
returns timestamptz language sql immutable as $$
  select timestamptz '2026-10-01 00:00:00-03:00';
$$;

comment on function public.vip_founder_deadline() is
  'Fim da janela da Moldura Fundador (exclusivo). Espelha VIP_FOUNDER_DEADLINE em lib/profile-frames.ts — mudar um exige mudar o outro.';

-- ────────────────────────────────────────────
-- 3. Concessão idempotente
-- ────────────────────────────────────────────
-- Uma função só, usada pelo trigger E pelo backfill, para que as duas
-- concessões não possam divergir.
--
-- Devolve `true` só quando a posse foi criada AGORA — o backfill usa isso
-- para contar quantos recebeu de fato.
create or replace function public.grant_vip_founder_frame(p_user_id uuid)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_item_id  uuid;
  v_inserted integer;
begin
  -- Janela fechada: ninguém mais recebe, nem por caminho novo. Esta é a trava
  -- que faz a moldura ser de fato irrepetível.
  if now() >= public.vip_founder_deadline() then
    return false;
  end if;

  select id into v_item_id from public.aura_items where slug = 'vip:founder';
  if v_item_id is null then
    return false;
  end if;

  -- `do nothing`: reativar, renovar ou re-assinar dentro da janela passa por
  -- aqui várias vezes; a posse é uma só e `acquired_at` guarda a PRIMEIRA vez.
  insert into public.user_aura_items (user_id, item_id)
  values (p_user_id, v_item_id)
  on conflict (user_id, item_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

comment on function public.grant_vip_founder_frame(uuid) is
  'Concede a Moldura Fundador se a janela ainda estiver aberta. Idempotente. Chamada pelo trigger de user_profiles e pelo backfill.';

revoke execute on function public.grant_vip_founder_frame(uuid) from public, anon, authenticated;

grant execute on function public.grant_vip_founder_frame(uuid) to service_role;

-- ────────────────────────────────────────────
-- 4. O gatilho: virou VIP dentro da janela, ganhou
-- ────────────────────────────────────────────
-- AFTER, não BEFORE: a posse só faz sentido depois que a linha de fato virou
-- VIP. E depois do trigger anti-escalação (`trg_guard_user_profiles_privileged`,
-- BEFORE), que é quem garante que um cliente comum não consegue se declarar
-- VIP — sem essa ordem, um UPDATE forjado ganharia a moldura antes de ser
-- revertido.
--
-- Condição: a linha PASSA a ter VIP ativo. Cobre tanto `common -> vip` quanto
-- a renovação de um VIP que havia expirado (tier continua 'vip', só a data
-- anda para frente) — este segundo caso é o de quem assinou, deixou vencer e
-- voltou ainda dentro da janela.
create or replace function public.on_user_becomes_vip_grant_founder()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if public.is_vip_active(new.account_tier, new.vip_expires_at)
     and not public.is_vip_active(old.account_tier, old.vip_expires_at) then
    perform public.grant_vip_founder_frame(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_grant_vip_founder_frame on public.user_profiles;

create trigger trg_grant_vip_founder_frame
  after update of account_tier, vip_expires_at on public.user_profiles
  for each row execute function public.on_user_becomes_vip_grant_founder();

-- INSERT: conta que já nasce VIP (só service_role consegue — o trigger
-- anti-escalação zera o tier de qualquer INSERT de cliente).
create or replace function public.on_user_inserted_vip_grant_founder()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if public.is_vip_active(new.account_tier, new.vip_expires_at) then
    perform public.grant_vip_founder_frame(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_grant_vip_founder_frame_insert on public.user_profiles;

create trigger trg_grant_vip_founder_frame_insert
  after insert on public.user_profiles
  for each row execute function public.on_user_inserted_vip_grant_founder();

-- ────────────────────────────────────────────
-- 5. Backfill — quem JÁ é VIP
-- ────────────────────────────────────────────
-- Quem assinou antes desta migration não passou por nenhum trigger, e não
-- teria como receber. Sem este passo a moldura sairia premiando só quem
-- assinasse DEPOIS do deploy, punindo exatamente os apoiadores mais antigos.
--
-- Critério: VIP ativo AGORA (`is_vip_active`, o mesmo do resto do site).
-- Inclui quem tem `vip_expires_at` nulo (VIP manual/vitalício de cargo).
do $$
declare
  v_item_id uuid;
  v_count   integer;
begin
  if now() >= public.vip_founder_deadline() then
    raise notice 'Janela de Fundador já fechada — backfill ignorado.';
    return;
  end if;

  select id into v_item_id from public.aura_items where slug = 'vip:founder';
  if v_item_id is null then
    raise exception 'Item vip:founder não encontrado — a inserção do catálogo falhou.';
  end if;

  insert into public.user_aura_items (user_id, item_id)
  select p.id, v_item_id
  from public.user_profiles p
  where public.is_vip_active(p.account_tier, p.vip_expires_at)
  on conflict (user_id, item_id) do nothing;

  get diagnostics v_count = row_count;
  raise notice 'Moldura Fundador concedida a % VIPs no backfill.', v_count;
end $$;
