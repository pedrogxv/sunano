-- Corrige upload de banner/mini banner do perfil (RLS de storage.objects).
--
-- 20260809_forum_media_storage_rls.sql reescreveu as policies "Scoped
-- upload/update/delete access" (bucket "peripherals") do zero para liberar
-- `forum-post-<uid>-*`, mas sem carregar adiante o padrão
-- `user-banner-<uid>-*` que 20260728000001_public_profile_showcase.sql
-- (antigo 20260728_public_profile_showcase.sql) havia adicionado. Resultado:
-- todo upload em app/api/profile/upload-banner/route.ts (banner e mini
-- banner, que usam o mesmo endpoint) passou a ser rejeitado pelo Postgres
-- com "row-level security policy violation", surfaceado no front como o
-- erro genérico "Erro ao enviar banner".
--
-- Numerada 20260811 (depois de 20260810_forum_aura_10x_and_daily_limit.sql)
-- de propósito: precisa rodar depois de 20260809_forum_media_storage_rls.sql
-- na ordem de replay, senão essa migração desfaz o fix de novo. Recria as
-- três policies com o estado atual de produção (inclui `forum-post-`) e
-- devolve o padrão `user-banner-`.

drop policy if exists "Scoped upload access" on storage.objects;
create policy "Scoped upload access"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'peripherals'
  and (
    name like 'user-avatar-' || auth.uid()::text || '-%'
    or name like 'user-banner-' || auth.uid()::text || '-%'
    or name like 'admin-avatar-' || auth.uid()::text || '-%'
    or name like 'forum-post-' || auth.uid()::text || '-%'
    or (name like 'blog-cover-%' and public.admin_has_permission('blog_write'))
  )
);

drop policy if exists "Scoped update access" on storage.objects;
create policy "Scoped update access"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'peripherals'
  and (
    name like 'user-avatar-' || auth.uid()::text || '-%'
    or name like 'user-banner-' || auth.uid()::text || '-%'
    or name like 'admin-avatar-' || auth.uid()::text || '-%'
    or name like 'forum-post-' || auth.uid()::text || '-%'
    or (name like 'blog-cover-%' and public.admin_has_permission('blog_write'))
  )
)
with check (
  bucket_id = 'peripherals'
  and (
    name like 'user-avatar-' || auth.uid()::text || '-%'
    or name like 'user-banner-' || auth.uid()::text || '-%'
    or name like 'admin-avatar-' || auth.uid()::text || '-%'
    or name like 'forum-post-' || auth.uid()::text || '-%'
    or (name like 'blog-cover-%' and public.admin_has_permission('blog_write'))
  )
);

drop policy if exists "Scoped delete access" on storage.objects;
create policy "Scoped delete access"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'peripherals'
  and (
    name like 'user-avatar-' || auth.uid()::text || '-%'
    or name like 'user-banner-' || auth.uid()::text || '-%'
    or name like 'admin-avatar-' || auth.uid()::text || '-%'
    or name like 'forum-post-' || auth.uid()::text || '-%'
    or (name like 'blog-cover-%' and public.admin_has_permission('blog_write'))
    or public.admin_has_permission('peripherals_write')
  )
);
