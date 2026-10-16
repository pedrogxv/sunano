-- Vídeo do anúncio da Loja (tutorial de serviço, demonstração do produto),
-- tocado na galeria da página do produto. `store_products.video_url` já existe
-- (20260901000001) e aceita link do YouTube; agora aceita também um MP4
-- enviado pelo painel em /api/admin/store/upload-video.
--
-- Bucket próprio: `images` (fotos do produto) só aceita imagem, e
-- `store-banners`/`peripheral-videos` têm teto de 20MB pensado para clipe curto
-- em loop. Tutorial gravado de tela é mais longo, por isso 50MB.
--
-- O arquivo sobe do navegador por signed upload URL (a Vercel corta o corpo
-- em ~4.5MB). Sem policy em storage.objects: quem gera a signed URL é a rota
-- com service_role, e o bucket é público para leitura (mesmo padrão de
-- `store-banners`).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-product-videos',
  'store-product-videos',
  true,
  52428800, -- 50MB, igual a STORE_PRODUCT_VIDEO_MAX_BYTES (lib/store-product-video.ts)
  array['video/mp4']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
