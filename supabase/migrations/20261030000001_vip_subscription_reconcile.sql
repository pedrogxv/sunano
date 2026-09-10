-- Reconciliação da assinatura VIP com a Asaas + conserto da contradição
-- entre `account_tier` e `vip_expires_at`.
--
-- SINTOMA QUE ORIGINOU ISTO: usuário cancelou a assinatura, o modal passou a
-- oferecer "Seja VIP" (isVipActive = false) mas POST /api/vip/subscribe
-- respondia 409 "Você já tem uma assinatura em andamento" — sem VIP, sem
-- poder reassinar, e com a assinatura ainda ATIVA cobrando na Asaas.
--
-- Três fontes discordavam ao mesmo tempo:
--   • Asaas            -> subscription ACTIVE, deleted=false (cobrando)
--   • vip_subscriptions-> status 'active', canceled_at null (cancel não gravou)
--   • user_profiles    -> account_tier 'common' + vip_expires_at no FUTURO
--
-- O último par é o que trava a UI: `is_vip_active`/`isVipActive` exige
-- account_tier = 'vip' E vip_expires_at futuro. Com o tier rebaixado antes da
-- hora, o acesso pago some mas a linha de assinatura continua ocupando a
-- trava de "assinatura em andamento".

-- ────────────────────────────────────────────
-- 1. Conserta os perfis já contraditórios
--
-- account_tier='common' + vip_expires_at no futuro é sempre um estado
-- inválido: ou o período pago vale (tier deve ser 'vip'), ou não vale (a
-- data deveria ter sido cortada). Quem tem uma assinatura viva ou um período
-- ainda não vencido recupera o tier; a data manda, porque é ela que o
-- pagamento comprou.
-- ────────────────────────────────────────────
update public.user_profiles
set account_tier = 'vip'
where account_tier = 'common'
  and vip_expires_at is not null
  and vip_expires_at > now();

-- ────────────────────────────────────────────
-- 2. Trigger de coerência: nunca mais deixa os dois campos se contradizerem
--
-- Ponto único de verdade no banco, espelhando `is_vip_active`. Não inventa
-- acesso: só impede a combinação impossível "tier comum com período pago em
-- aberto", promovendo o tier para 'vip' enquanto a data estiver no futuro.
-- VIP sem expiração (cargo/manual, vip_expires_at IS NULL) não é tocado.
--
-- Escrever account_tier='common' junto com vip_expires_at=now() (ou passado)
-- continua funcionando normalmente — é assim que expire_vip_accounts e
-- end_vip_subscription rebaixam de verdade.
-- ────────────────────────────────────────────
create or replace function public.enforce_vip_tier_coherence()
returns trigger
language plpgsql
set search_path = public as $$
begin
  if new.account_tier = 'common'
     and new.vip_expires_at is not null
     and new.vip_expires_at > now() then
    new.account_tier := 'vip';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_vip_tier_coherence on public.user_profiles;
create trigger trg_enforce_vip_tier_coherence
  before insert or update of account_tier, vip_expires_at on public.user_profiles
  for each row execute function public.enforce_vip_tier_coherence();

-- ────────────────────────────────────────────
-- 3. reconcile_vip_subscription — alinha a linha local ao que a Asaas diz
--
-- Chamada por GET /api/vip/subscription e por POST /api/vip/subscribe depois
-- de consultar a assinatura na origem (`getSubscription`). A Asaas é a fonte
-- de verdade sobre "essa assinatura ainda cobra?"; o banco local é só um
-- espelho, e quando o espelho mente é ele que cede.
--
-- p_asaas_active = false  -> assinatura sumiu/foi excluída lá (ou o cancel
--                            chegou a ir mas o commit local falhou). Marca
--                            'canceled' e LIBERA a trava de reassinatura.
--                            `vip_expires_at` não recua: o período já pago é
--                            do usuário, igual ao cancelamento voluntário.
-- p_asaas_active = true   -> continua cobrando; garante que o acesso local
--                            reflita isso (não deixa assinante pagante sem
--                            VIP, que é exatamente o bug relatado).
--
-- Idempotente: rodar de novo sem divergência não muda nada e devolve false.
-- ────────────────────────────────────────────
create or replace function public.reconcile_vip_subscription(
  p_user_id      uuid,
  p_asaas_active boolean
) returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_sub_id  uuid;
  v_status  text;
  v_period  timestamptz;
  v_changed boolean := false;
begin
  select id, status, current_period_end into v_sub_id, v_status, v_period
  from public.vip_subscriptions
  where user_id = p_user_id
  for update;

  if not found then
    return false;
  end if;

  if p_asaas_active then
    -- A Asaas ainda cobra. O usuário TEM de ter o acesso correspondente —
    -- sem isto ele paga todo mês e a UI diz que ele não é VIP.
    if v_status in ('active', 'past_due') and v_period is not null and v_period > now() then
      update public.user_profiles
      set account_tier = 'vip',
          vip_expires_at = greatest(coalesce(vip_expires_at, v_period), v_period)
      where id = p_user_id
        and (account_tier <> 'vip' or coalesce(vip_expires_at, 'epoch'::timestamptz) < v_period);
      v_changed := found;
    end if;
    return v_changed;
  end if;

  -- A Asaas não tem mais essa assinatura viva: a linha local não pode seguir
  -- ocupando a trava de "assinatura em andamento".
  if v_status in ('pending', 'active', 'past_due') then
    update public.vip_subscriptions
    set status = 'canceled',
        canceled_at = coalesce(canceled_at, now()),
        updated_at = now()
    where id = v_sub_id;
    v_changed := true;
  end if;

  return v_changed;
end;
$$;

revoke execute on function public.reconcile_vip_subscription(uuid, boolean) from public, anon, authenticated;
grant execute on function public.reconcile_vip_subscription(uuid, boolean) to service_role;

-- ────────────────────────────────────────────
-- 4. cancel_vip_subscription passa a aceitar linha em QUALQUER estado
--
-- A versão anterior só marcava linhas em ('active','past_due','pending') e
-- devolvia `found`. Combinada com a trava de POST /api/vip/cancel — que exige
-- `getOngoingSubscriptionForUser` — o usuário cuja linha já estava 'canceled'
-- mas cuja assinatura seguia viva na Asaas recebia 404 e NÃO TINHA COMO
-- parar a cobrança. Agora o cancelamento é idempotente de verdade: reafirmar
-- o cancelamento de uma linha já cancelada é sucesso, não erro.
-- ────────────────────────────────────────────
create or replace function public.cancel_vip_subscription(
  p_user_id uuid default null,
  p_asaas_subscription_id text default null,
  p_asaas_checkout_id text default null
) returns boolean
language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id is null and p_asaas_subscription_id is null and p_asaas_checkout_id is null then
    raise exception 'missing_identifier';
  end if;

  update public.vip_subscriptions
  set status = 'canceled',
      canceled_at = coalesce(canceled_at, now()),
      updated_at = now()
  where (
      (p_user_id is not null and user_id = p_user_id)
      or (p_asaas_subscription_id is not null and asaas_subscription_id = p_asaas_subscription_id)
      or (p_asaas_checkout_id is not null and asaas_checkout_id = p_asaas_checkout_id)
    )
    -- Só evita a escrita à toa quando já está no estado final desejado.
    and status <> 'canceled';

  return found;
end;
$$;

revoke execute on function public.cancel_vip_subscription(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cancel_vip_subscription(uuid, text, text) to service_role;
