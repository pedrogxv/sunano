-- Links de redes sociais no perfil público — YouTube e TikTok.
--
-- Modelo simples: apenas o handle (sem OAuth), exibido como ícone clicável
-- em `/perfil/[handle]`. Sem validação de posse da conta — o usuário só
-- informa como quer ser encontrado, igual a um campo de bio.

alter table public.user_profiles
  add column if not exists youtube_handle text,
  add column if not exists tiktok_handle  text;

alter table public.user_profiles
  drop constraint if exists user_profiles_youtube_handle_check;
alter table public.user_profiles
  add constraint user_profiles_youtube_handle_check
  check (youtube_handle is null or youtube_handle ~ '^[A-Za-z0-9._-]{1,30}$');

alter table public.user_profiles
  drop constraint if exists user_profiles_tiktok_handle_check;
alter table public.user_profiles
  add constraint user_profiles_tiktok_handle_check
  check (tiktok_handle is null or tiktok_handle ~ '^[A-Za-z0-9._-]{1,30}$');

comment on column public.user_profiles.youtube_handle is
  'Handle do YouTube sem "@" (ex.: sunano). Só exibição — não valida posse da conta.';
comment on column public.user_profiles.tiktok_handle is
  'Handle do TikTok sem "@" (ex.: sunano). Só exibição — não valida posse da conta.';
