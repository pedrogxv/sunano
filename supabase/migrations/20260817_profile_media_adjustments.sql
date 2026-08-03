-- Enquadramento das imagens do perfil (foto, banner e fundo do Mini Perfil).
--
-- Uma coluna JSONB para as três imagens em vez de nove colunas numéricas: os
-- valores só são lidos juntos, sempre pelo mesmo código, e nunca são filtrados
-- nem ordenados no SQL — não há o que ganhar espalhando-os em colunas.
--
-- Formato: { "avatar": {"x":50,"y":50,"zoom":1}, "banner": {...}, "mini_banner": {...} }
-- `x`/`y` em porcentagem (0–100, o que `object-position` entende) e `zoom` de
-- 1 a 3. Ver `lib/profile-media-adjust.ts`, que normaliza tudo o que sai daqui
-- antes de virar CSS — perfil com JSON inválido cai no enquadramento padrão em
-- vez de quebrar.
--
-- O ajuste é não-destrutivo de propósito: o arquivo enviado não é recortado,
-- então o GIF de um membro VIP continua animando (um recorte real passaria a
-- imagem por um canvas, que devolve um quadro só).

alter table public.user_profiles
  add column if not exists media_adjustments jsonb not null default '{}'::jsonb;

comment on column public.user_profiles.media_adjustments is
  'Enquadramento não-destrutivo das imagens do perfil, por chave (avatar, banner, mini_banner): {"x":0-100,"y":0-100,"zoom":1-3}. Aplicado como object-position/scale na exibição; ver lib/profile-media-adjust.ts.';
