-- Janela de edição dos comentários (fórum e notícias).
--
-- O autor pode reescrever o próprio comentário por 15 minutos depois de
-- publicar; passado o prazo, o comentário fica imutável. Quem decide isso é o
-- servidor, comparando `created_at` com `now()` nos repositórios (ver
-- `lib/comment-edit.ts`) — o botão que some na UI é só conveniência, não
-- autorização.
--
-- `updated_at` não serve para marcar edição: o trigger de updated_at destas
-- tabelas dispara em qualquer update, e a contagem de Aura escreve nelas o
-- tempo todo. Daí uma coluna própria, que só a edição de texto toca.
--
-- `is_edited` é derivado de `edited_at` por coluna gerada, em vez de um
-- booleano solto — mesmo motivo de `body_preview`: não há como os dois saírem
-- de sincronia se algum update futuro esquecer de escrever um dos dois.

alter table public.forum_comments
  add column if not exists edited_at timestamptz;

alter table public.forum_comments
  add column if not exists is_edited boolean
  generated always as (edited_at is not null) stored;

alter table public.blog_comments
  add column if not exists edited_at timestamptz;

alter table public.blog_comments
  add column if not exists is_edited boolean
  generated always as (edited_at is not null) stored;

comment on column public.forum_comments.edited_at is
  'Quando o autor reescreveu o comentário pela última vez. Null = nunca editado. Só a edição de texto escreve aqui (updated_at muda também por Aura/moderação).';

comment on column public.forum_comments.is_edited is
  'Coluna gerada (`edited_at is not null`) — nunca enviada no Insert/Update. Alimenta o rótulo "(editado)" na UI.';

comment on column public.blog_comments.edited_at is
  'Quando o autor reescreveu o comentário pela última vez. Null = nunca editado. Só a edição de texto escreve aqui (updated_at muda também por Aura/moderação).';

comment on column public.blog_comments.is_edited is
  'Coluna gerada (`edited_at is not null`) — nunca enviada no Insert/Update. Alimenta o rótulo "(editado)" na UI.';
