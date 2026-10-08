-- Vídeo de deslize de mousepad/glasspad: clipe curto (5-8s, MP4) em loop na
-- página do periférico, enviado pelo painel em /api/admin/peripherals/upload-video.
--
-- Bucket próprio em vez de reaproveitar `peripherals`: aquele aceita só imagem
-- (20261103000000) e é compartilhado com mídia de perfil, banner e logo. Abrir
-- `video/mp4` lá valeria para todos esses fluxos.
--
-- Sem policy em storage.objects: o upload passa pela rota com service_role, e
-- o bucket é público para leitura (mesmo padrão de `store-banners`).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'peripheral-videos',
  'peripheral-videos',
  true,
  20971520, -- 20MB, igual a UPLOAD_LIMITS.video
  array['video/mp4']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
