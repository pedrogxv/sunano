-- Remove o tier VIP+ — consolidado em um único VIP.
--
-- Contexto: VIP+ era um segundo nível de tier editável manualmente
-- (ver 20260728000001_public_profile_showcase.sql). VIP agora é concedido
-- automaticamente a quem tem cargo (Web Master, Admin, Moderador, Editor,
-- Vendedor, Suporte) e deixou de ser editável na UI — não há mais motivo
-- para um segundo nível. Contas que eram vip_plus viram vip, mantendo os
-- limites (8 medalhas / 8 favoritos) e o visual (badge fúcsia com brilho)
-- que o VIP+ já tinha.

update public.user_profiles
  set account_tier = 'vip'
  where account_tier = 'vip_plus';

alter table public.user_profiles
  drop constraint if exists user_profiles_account_tier_check;
alter table public.user_profiles
  add constraint user_profiles_account_tier_check
  check (account_tier in ('common', 'vip'));

comment on column public.user_profiles.account_tier is
  'Tier da conta: common | vip. Concedido automaticamente a quem tem cargo — não editável manualmente. Controla mídia animada (GIF) no banner/avatar e os limites de medalhas e favoritos exibidos.';
comment on column public.user_profiles.banner_url is
  'Imagem de capa do perfil. GIF só anima para contas vip.';
comment on column public.user_profiles.mini_banner_url is
  'Faixa curta exibida atrás do avatar no card do diretório e no mini perfil. GIF só anima para contas vip, igual a banner_url.';
