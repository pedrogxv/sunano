-- Único ponto de verdade em SQL para "é VIP agora" — espelha isVipActive()
-- em lib/account-tier.ts. Usada por apply_aura_gain, pelas RPCs de toggle
-- (limite diário), pela loja de Aura (desconto) e pelas RPCs de assinatura,
-- em vez de cada função reimplementar a checagem de vip_expires_at.
create or replace function public.is_vip_active(p_account_tier text, p_vip_expires_at timestamptz)
returns boolean
language sql immutable as $$
  select p_account_tier = 'vip' and (p_vip_expires_at is null or p_vip_expires_at > now());
$$;

comment on function public.is_vip_active(text, timestamptz) is
  'VIP "ativo" = account_tier=''vip'' AND (vip_expires_at IS NULL [manual/cargo, sem expiração] OR vip_expires_at > now() [ainda dentro do período pago]). Espelho SQL de isVipActive() em lib/account-tier.ts — mudar um, mudar o outro.';

grant execute on function public.is_vip_active(text, timestamptz) to service_role, authenticated, anon;
