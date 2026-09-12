-- Libera GIF no bucket `comments` — a validação em app/api/comments/upload-image
-- (magic bytes) e o `ALLOWED_COMMENT_IMAGE_MIME_TYPES` já aceitam GIF desde a
-- feature de comentário só-mídia; faltava só essa segunda barreira no Storage,
-- que ainda travava em jpeg/png/webp desde 20260825_comment_images_and_mentions.sql.
--
-- Aplicar via Supabase Dashboard (SQL Editor) — `supabase db push` está
-- quebrado neste projeto (histórico de migration dessincronizado desde
-- 04/08, ver notas internas).

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'comments';
