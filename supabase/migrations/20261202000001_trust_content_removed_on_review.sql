-- A penalidade `content_removed` do Trust Factor passa a valer nas DUAS ordens
-- de moderacao.
--
-- O BUG
-- -----
-- `trust_on_forum_post_hidden` / `trust_on_forum_comment_hidden`
-- (20261129000003) so' aplicam o evento se JA' existir denuncia `reviewed` no
-- instante em que `is_hidden` vira true. O filtro e' certo e precisa ficar:
-- `is_hidden` e' a mesma coluna que o dono usa para ocultar o proprio texto e
-- que `admin_ban_account` usa em massa, entao penalizar toda transicao para
-- true puniria quem apagou o proprio post e geraria dezenas de eventos por um
-- unico ban.
--
-- O que nao funciona e' a ORDEM. Ocultar e fechar denuncia sao telas
-- separadas: ocultar esta' em /admin/forum (app/api/admin/forum/moderation),
-- fechar esta' em /admin/forum/denuncias, e nao havia trigger em
-- `forum_reports`. A sequencia natural do moderador (ve a denuncia, vai
-- ocultar o conteudo, volta e marca revisada) roda o trigger com a denuncia
-- ainda `pending`: ele sai pelo early return e o evento nunca nasce. Como o
-- trigger so' reage a transicao false -> true, marcar revisada depois tambem
-- nao recupera. Na pratica o -2 so' acontecia se o moderador fechasse a
-- denuncia ANTES de ocultar, que e' a ordem menos provavel.
--
-- A CORRECAO
-- ----------
-- Um segundo gatilho, no outro lado do par: ao marcar a denuncia como
-- `reviewed`, se o conteudo denunciado JA' esta' oculto, o evento entra
-- agora. Os dois triggers cobrem as duas ordens e nao se atropelam, porque
-- compartilham o mesmo `dedupe_key` (`content_removed:post:<id>` /
-- `content_removed:comment:<id>`) e `apply_trust_event` recusa chave repetida.
-- Varias denuncias revisadas sobre o mesmo conteudo tambem contam uma vez so'.
--
-- `dismissed` nao penaliza: denuncia descartada e' acusacao que a moderacao
-- recusou, nao infracao. Mesma leitura de `trust_detect_suspicious`, que conta
-- so' denuncia revisada.
--
-- POR QUE A CHECAGEM DE BANIMENTO
-- -------------------------------
-- Sem ela este trigger REABRIRIA o problema que o de `is_hidden` evita.
-- `admin_ban_account` oculta o conteudo do banido em massa; se depois o
-- moderador limpar a fila de denuncias pendentes daquela pessoa, cada
-- denuncia fechada encontraria o conteudo ja' oculto e somaria mais um -2 em
-- cima do -40 critico do proprio ban. Dez posts denunciados virariam -60
-- extras por um unico ban. A regra do sistema e' "um ban, um evento", entao
-- conta banida sai fora aqui.

create or replace function public.trust_on_report_reviewed()
returns trigger language plpgsql
security definer set search_path = public as $$
declare
  v_user_id    uuid;
  v_dedupe_key text;
  v_reason     text;
begin
  if new.status is distinct from 'reviewed' or old.status is not distinct from 'reviewed' then
    return new;
  end if;

  -- So' conta se o conteudo de fato saiu do ar. Denuncia revisada sobre
  -- conteudo que continua visivel e' denuncia analisada e MANTIDA, nao
  -- remocao: o `is_hidden` e' o que caracteriza "removido".
  if new.target_type = 'post' then
    select user_id into v_user_id
    from public.forum_posts
    where id = new.post_id and coalesce(is_hidden, false);

    v_dedupe_key := 'content_removed:post:' || new.post_id::text;
    v_reason     := 'Post removido por infracao';
  else
    select user_id into v_user_id
    from public.forum_comments
    where id = new.comment_id and coalesce(is_hidden, false);

    v_dedupe_key := 'content_removed:comment:' || new.comment_id::text;
    v_reason     := 'Comentario removido por infracao';
  end if;

  if v_user_id is null then
    return new;
  end if;

  -- Ver "POR QUE A CHECAGEM DE BANIMENTO" no cabecalho.
  if exists (
    select 1 from public.user_profiles
    where id = v_user_id and account_banned_at is not null
  ) then
    return new;
  end if;

  perform public.apply_trust_event(
    v_user_id,
    'content_removed',
    -2,
    'light',
    v_reason,
    'moderation',
    v_dedupe_key
  );

  return new;
end;
$$;

revoke execute on function public.trust_on_report_reviewed() from public, anon, authenticated;

drop trigger if exists trg_trust_on_report_reviewed on public.forum_reports;
create trigger trg_trust_on_report_reviewed
  after update of status on public.forum_reports
  for each row execute function public.trust_on_report_reviewed();

comment on function public.trust_on_report_reviewed() is
  'Aplica content_removed quando a denuncia e revisada DEPOIS de o conteudo ja ter sido ocultado. Par de trust_on_forum_post_hidden, que cobre a ordem inversa; dedupe_key compartilhado impede contar duas vezes.';
