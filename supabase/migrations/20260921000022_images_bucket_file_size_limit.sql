-- Bucket `images` (events/store/market) foi criado manualmente no dashboard
-- e nunca ganhou `file_size_limit` no próprio bucket — a checagem de 5MB
-- existia só em nível de app (MAX_FILE_SIZE_BYTES em
-- app/api/admin/events/upload-image, app/api/admin/store/upload-image e
-- app/api/market/upload-image). Trava aqui como segunda barreira, mesmo
-- padrão do bucket `comments`/`support`.
--
-- Aplicar via Supabase Dashboard (SQL Editor) — `supabase db push` está
-- quebrado neste projeto (histórico de migration dessincronizado desde
-- 04/08, ver notas internas).

update storage.buckets
set file_size_limit = 5242880
where id = 'images';
