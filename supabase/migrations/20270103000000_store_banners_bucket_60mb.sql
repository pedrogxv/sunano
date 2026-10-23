-- Vídeo de fundo do Hero da Loja (/api/admin/store-hero/upload-video) sobe
-- para o bucket `store-banners`, cujo teto era 20MB (20260822000000), pensado
-- para clipe curto de banner de seção. O Hero recebe vídeo mais longo: 60MB,
-- igual a STORE_HERO_VIDEO_MAX_BYTES (lib/store-hero.ts).
--
-- O teto do bucket vale para o bucket inteiro, mas imagem e vídeo de banner de
-- seção continuam barrados nas próprias rotas (UPLOAD_LIMITS em
-- lib/upload-limits.ts), que passam pelo servidor. Só o upload por signed URL
-- do Hero depende deste número.
update storage.buckets
set file_size_limit = 62914560 -- 60MB
where id = 'store-banners';
