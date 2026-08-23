-- Rebaixa em lote quem passou de vip_expires_at. Chamada pelo cron diário
-- (app/api/cron/vip-expiration/route.ts, ver vercel.json). NÃO mexe em quem
-- tem vip_expires_at IS NULL (VIP manual/cargo, sem expiração — ver
-- 20260820000001_remove_vip_plus_tier.sql). Idempotente: rodar 2x seguidas
-- na mesma janela não tem efeito colateral, o WHERE já exclui quem foi
-- rebaixado na primeira passada.
--
-- Isso é a segunda camada de defesa (cron); a primeira é a checagem lazy
-- via is_vip_active()/isVipActive() em todo ponto de leitura, que já reflete
-- "não é mais VIP" mesmo antes deste cron rodar.
create or replace function public.expire_vip_accounts()
returns integer
language plpgsql security definer
set search_path = public as $$
declare
  v_count integer;
begin
  update public.user_profiles
  set account_tier = 'common'
  where account_tier = 'vip'
    and vip_expires_at is not null
    and vip_expires_at <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_vip_accounts() from public, anon, authenticated;
grant execute on function public.expire_vip_accounts() to service_role;
