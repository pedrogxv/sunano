-- Corrige upload de banner/mini banner do perfil (RLS de storage.objects).
--
-- As policies "Scoped upload/update/delete access" (bucket "peripherals")
-- foram recriadas em algum momento fora deste histórico de migrações (ao que
-- tudo indica, ao adicionar o padrão `forum-post-<uid>-*` para imagens do
-- fórum) sem carregar adiante o padrão `user-banner-<uid>-*`, que havia sido
-- adicionado em 20260728_public_profile_showcase.sql. Resultado: todo upload
-- em app/api/profile/upload-banner/route.ts (banner e mini banner, que usam
-- o mesmo endpoint) era rejeitado pelo Postgres com "row-level security
-- policy violation", surfaceado no front como o erro genérico "Erro ao
-- enviar banner".
--
-- Recria as três policies com o estado atualmente em produção (inclui
-- `forum-post-`, confirmado via `supabase db query --linked` antes deste
-- fix) e devolve o padrão `user-banner-`.

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
