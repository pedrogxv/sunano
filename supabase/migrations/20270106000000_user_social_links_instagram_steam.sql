-- Instagram e Steam no perfil público, ao lado de YouTube e TikTok
-- (`20260802_user_social_links`).
--
-- Mesmo modelo: só o handle, sem OAuth, exibido como ícone clicável em
-- `/perfil/[handle]`. Os formatos espelham `lib/profile-socials.ts`.
--
-- Steam guarda a URL personalizada (`steamcommunity.com/id/<url>`, até 32
-- caracteres) ou, para quem não tem uma, o SteamID64
-- (`steamcommunity.com/profiles/7656…`). O link sai do formato do valor.
--
-- Colunas novas em `user_profiles` não ganham grant para anon/authenticated:
-- a leitura e a escrita passam pela rota (`/api/profile`) com service_role.

alter table public.user_profiles
  add column if not exists instagram_handle text,
  add column if not exists steam_handle     text;

alter table public.user_profiles
  drop constraint if exists user_profiles_instagram_handle_check;
alter table public.user_profiles
  add constraint user_profiles_instagram_handle_check
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._-]{1,30}$');

alter table public.user_profiles
  drop constraint if exists user_profiles_steam_handle_check;
alter table public.user_profiles
  add constraint user_profiles_steam_handle_check
  check (steam_handle is null or steam_handle ~ '^[A-Za-z0-9._-]{1,32}$');

comment on column public.user_profiles.instagram_handle is
  'Usuário do Instagram sem "@" (ex.: sunano.gg). Só exibição — não valida posse da conta.';
comment on column public.user_profiles.steam_handle is
  'URL personalizada da Steam ou SteamID64. Só exibição — não valida posse da conta.';
