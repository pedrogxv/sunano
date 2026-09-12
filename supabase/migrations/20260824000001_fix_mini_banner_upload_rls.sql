-- Corrige upload de fundo do Mini Perfil (RLS de storage.objects).
--
-- app/api/profile/upload-mini-banner/route.ts (commit 0f3bca1, 2026-08-02) foi
-- criada como rota própria, separada de upload-banner, e passou a gravar com
-- o prefixo `user-mini-banner-<uid>-*` para nunca colidir com o banner grande
-- no bucket "peripherals". Só que 20260811_fix_banner_upload_rls.sql (a
-- última a reescrever as três policies "Scoped upload/update/delete access")
-- só cobre `user-banner-`, `user-avatar-`, `admin-avatar-`, `forum-post-` e
-- `blog-cover-` — o novo prefixo do mini banner nunca foi adicionado.
-- Resultado: todo upload de fundo do Mini Perfil é rejeitado pelo Postgres
-- com "row-level security policy violation", surfaceado no front como
-- "Erro ao enviar o fundo do Mini Perfil — Não foi possível salvar a imagem".
--
-- Recria as três policies com o estado atual (tudo que 20260811 já tinha)
-- mais o padrão `user-mini-banner-`.

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
    or name like 'user-mini-banner-' || auth.uid()::text || '-%'
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
    or name like 'user-mini-banner-' || auth.uid()::text || '-%'
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
    or name like 'user-mini-banner-' || auth.uid()::text || '-%'
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
    or name like 'user-mini-banner-' || auth.uid()::text || '-%'
    or name like 'admin-avatar-' || auth.uid()::text || '-%'
    or name like 'forum-post-' || auth.uid()::text || '-%'
    or (name like 'blog-cover-%' and public.admin_has_permission('blog_write'))
    or public.admin_has_permission('peripherals_write')
  )
);
