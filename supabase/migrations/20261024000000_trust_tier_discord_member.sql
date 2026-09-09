-- Trust tier: ser MEMBRO CONFIRMADO do servidor do Discord passa a valer como
-- sinal de "conta verificada", no mesmo pé de "inscrito no YouTube".
--
-- Por quê: a conquista "Inscrito" do YouTube está desativada por env
-- (`YOUTUBE_SUBSCRIPTION_ENABLED`, ver lib/youtube-subscription.ts) enquanto a
-- YouTube Data API não devolve o status de inscrição de forma confiável.
-- Enquanto isso, `user_youtube_subscription` quase não recebe linhas novas, e
-- o único caminho "verified" que não depende de esperar 14 dias ou comprar VIP
-- fica de fato fora do ar. Ser membro do Discord (`user_discord_membership`,
-- 20261015000000) é o mesmo tipo de prova — conta social real, `unique
-- (discord_user_id)` global, verificada via OAuth — e continua funcionando.
--
-- O YouTube NÃO sai: quando a conquista for religada, `user_youtube_subscription`
-- volta a valer aqui sem nova migration. É só mais um caminho para o mesmo
-- tier, agora ao lado do Discord.
--
-- Reescreve só `get_giver_trust_tier`. `get_aura_trust_limits` e as três RPCs
-- de toggle (20260923000002 / 20260930000003) chamam esta função e não mudam.

create or replace function public.get_giver_trust_tier(p_giver_id uuid)
returns text
language plpgsql stable security definer
set search_path = public as $$
declare
  v_created_at     timestamptz;
  v_account_tier   text;
  v_vip_expires_at timestamptz;
  v_account_age    interval;
  v_social_ok      boolean;
begin
  select created_at, account_tier, vip_expires_at
    into v_created_at, v_account_tier, v_vip_expires_at
  from public.user_profiles
  where id = p_giver_id;

  if v_created_at is null then
    return 'new';
  end if;

  v_account_age := now() - v_created_at;

  if v_account_age < interval '3 days' then
    return 'new';
  end if;

  -- Conta social verificada: inscrito no YouTube OU membro confirmado do
  -- Discord. Basta uma. Quando a conquista do YouTube estiver religada, a
  -- primeira metade volta a pegar sozinha.
  select
    exists(select 1 from public.user_youtube_subscription where user_id = p_giver_id)
    or exists(select 1 from public.user_discord_membership where user_id = p_giver_id)
  into v_social_ok;

  if v_social_ok
    or public.is_vip_active(v_account_tier, v_vip_expires_at)
    or v_account_age >= interval '14 days'
  then
    return 'verified';
  end if;

  return 'normal';
end;
$$;

revoke execute on function public.get_giver_trust_tier(uuid) from public;
grant execute on function public.get_giver_trust_tier(uuid) to service_role, authenticated, anon;
