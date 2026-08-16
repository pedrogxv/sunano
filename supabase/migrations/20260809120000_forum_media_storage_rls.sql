-- Permite que o próprio usuário (não-admin) envie/troque/apague a mídia dos
-- seus posts do fórum, seguindo o padrão `user-avatar-<uid>-*` já usado para
-- avatar/banner de perfil (20260718_security_hardening.sql), com o prefixo
-- `forum-post-<uid>-*`.
--
-- Reescreve as 3 policies inteiras (não há ALTER POLICY para adicionar uma
-- condição a uma policy existente).

drop policy if exists "Scoped upload access" on storage.objects;
drop policy if exists "Scoped update access" on storage.objects;
drop policy if exists "Scoped delete access" on storage.objects;

create policy "Scoped upload access"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'peripherals'
  and (
    name like 'user-avatar-' || auth.uid()::text || '-%'
    or name like 'admin-avatar-' || auth.uid()::text || '-%'
    or name like 'forum-post-' || auth.uid()::text || '-%'
    or (name like 'blog-cover-%' and public.admin_has_permission('blog_write'))
  )
);

create policy "Scoped update access"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'peripherals'
  and (
    name like 'user-avatar-' || auth.uid()::text || '-%'
    or name like 'admin-avatar-' || auth.uid()::text || '-%'
    or name like 'forum-post-' || auth.uid()::text || '-%'
    or (name like 'blog-cover-%' and public.admin_has_permission('blog_write'))
  )
)
with check (
  bucket_id = 'peripherals'
  and (
    name like 'user-avatar-' || auth.uid()::text || '-%'
    or name like 'admin-avatar-' || auth.uid()::text || '-%'
    or name like 'forum-post-' || auth.uid()::text || '-%'
    or (name like 'blog-cover-%' and public.admin_has_permission('blog_write'))
  )
);

create policy "Scoped delete access"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'peripherals'
  and (
    name like 'user-avatar-' || auth.uid()::text || '-%'
    or name like 'admin-avatar-' || auth.uid()::text || '-%'
    or name like 'forum-post-' || auth.uid()::text || '-%'
    or (name like 'blog-cover-%' and public.admin_has_permission('blog_write'))
    or public.admin_has_permission('peripherals_write')
  )
);
