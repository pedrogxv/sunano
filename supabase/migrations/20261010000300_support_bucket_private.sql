-- Bucket `support` deixa de ser público: anexo de ticket é dado pessoal do
-- usuário (print de erro/produto), hoje acessível por qualquer um que tenha
-- a URL, sem autenticação (era `public = true` desde 20260921000016_support_tickets.sql).
--
-- Leitura passa a exigir signed URL, gerada sob demanda em
-- lib/server/support-media.ts (signSupportImageUrls) a partir da service
-- role key — só quem já tem acesso ao ticket (dono ou admin com
-- support_read) chega a essa chamada, então não precisa de policy de SELECT
-- adicional aqui.
--
-- Histórico não é migrado: as URLs públicas já salvas em
-- support_messages.image_urls continuam no formato antigo no banco, mas
-- support-media.ts extrai o nome do objeto delas e assina na leitura — ver
-- extractSupportObjectName.
update storage.buckets set public = false where id = 'support';

-- Bucket privado: `createSignedUrl` respeita RLS quando chamado com a anon
-- key (rota /api/support/upload-image, para o preview logo após o upload —
-- ver app/api/support/upload-image/route.ts). Sem policy de select aqui essa
-- chamada falharia com "not found". A leitura de mensagens já enviadas
-- (support-repository.ts) usa a service role key, que ignora RLS, então não
-- depende desta policy — mas o mesmo escopo (só o próprio arquivo do
-- usuário/admin) é o correto de qualquer forma.
drop policy if exists "Support images read access" on storage.objects;
create policy "Support images read access"
on storage.objects for select to authenticated
using (
  bucket_id = 'support'
  and (name like 'support-' || auth.uid()::text || '-%' or name like 'support-admin-' || auth.uid()::text || '-%')
);
