-- Ganho próprio de Aura (criar post, missão diária, bônus de ofensiva,
-- conquista) passa a virar UMA notificação somada em vez de uma por linha do
-- ledger.
--
-- O índice anti-spam `uniq_notifications_aura_once` (20260819_notifications.sql)
-- deduplica por (destinatário, quem deu, alvo) e o comentário dele diz que o
-- `coalesce` "cobre o bônus próprio, onde actor_id é null". Só que em ganho
-- próprio `entity_type`/`entity_id` também são NULL, e esses não foram
-- coalescidos — NULL em índice único é sempre distinto do outro NULL, então a
-- dedupe simplesmente nunca valeu para ganho próprio. Um único post gerava 4
-- avisos seguidos ("+10", "+5", "+10", "+25"), que é o que fez usuário achar
-- que a ofensiva diária estava bugada.
--
-- O mesmo índice ainda causava o problema inverso: `post_created` e
-- `comment_created` gravam os dois em `source_post_id` com `actor_id` null, e
-- quem comentava no próprio post caía na MESMA chave — a segunda notificação
-- era engolida em silêncio pelo `on conflict do nothing` de
-- `push_notification`.
--
-- Correção nos dois sentidos: ganho próprio não grava mais `entity_type`/
-- `entity_id` (nada a apontar — não há ator nem alvo único) e sai do alcance
-- do índice de vez; a dedupe passa a ser a soma explícita abaixo, numa janela
-- curta, sobre a notificação de ganho próprio mais recente ainda não lida. O
-- `link` continua sendo gravado quando o ganho tem origem rastreável, e a
-- primeira origem da leva é a que fica. Aura recebida de outra pessoa
-- (`giver_id` preenchido) não muda em nada: continua com entidade, link e a
-- dedupe do índice.

-- Janela de agregação: 10 minutos cobre com folga uma rodada de missões
-- diárias (postar + comentar + dar aura) sem grudar sessões diferentes.
create or replace function public.trg_notify_aura_received()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_entity_type text;
  v_entity_id   uuid;
  v_slug        text;
  v_link        text;
  v_merged      integer;
begin
  if new.delta is null or new.delta <= 0 then return new; end if;

  if new.source_post_id is not null then
    v_entity_type := 'forum_post';
    v_entity_id   := new.source_post_id;
    select slug into v_slug from public.forum_posts where id = new.source_post_id;
    if v_slug is not null then v_link := '/forum/' || v_slug; end if;

  elsif new.source_comment_id is not null then
    v_entity_type := 'forum_comment';
    v_entity_id   := new.source_comment_id;
    select p.slug into v_slug
      from public.forum_comments c
      join public.forum_posts p on p.id = c.post_id
     where c.id = new.source_comment_id;
    if v_slug is not null then v_link := '/forum/' || v_slug; end if;

  elsif new.source_blog_post_id is not null then
    v_entity_type := 'blog_post';
    v_entity_id   := new.source_blog_post_id;
    select slug into v_slug from public.blog_posts where id = new.source_blog_post_id;
    if v_slug is not null then v_link := '/blog/' || v_slug; end if;

  elsif new.source_blog_comment_id is not null then
    v_entity_type := 'blog_comment';
    v_entity_id   := new.source_blog_comment_id;
    select p.slug into v_slug
      from public.blog_comments c
      join public.blog_posts p on p.id = c.post_id
     where c.id = new.source_blog_comment_id;
    if v_slug is not null then v_link := '/blog/' || v_slug; end if;
  end if;

  if new.giver_id is null then
    -- Bloco protegido pela mesma razão do `exception` de `push_notification`:
    -- falha ao notificar não pode derrubar o crédito de aura que a originou.
    v_merged := 0;
    begin
      update public.notifications
         set amount     = coalesce(amount, 0) + new.delta,
             link       = coalesce(link, v_link),
             created_at = now()
       where id = (
         select id from public.notifications
          where user_id = new.user_id
            and type = 'aura_received'
            and actor_id is null
            and not is_read
            and created_at >= now() - interval '10 minutes'
          order by created_at desc
          limit 1
       );
      get diagnostics v_merged = row_count;
    exception when others then
      raise warning 'trg_notify_aura_received: soma do ganho próprio falhou: %', sqlerrm;
      v_merged := 0;
    end;

    if v_merged = 0 then
      perform public.push_notification(
        p_user_id => new.user_id,
        p_type    => 'aura_received',
        p_link    => v_link,
        p_amount  => new.delta
      );
    end if;

    return new;
  end if;

  perform public.push_notification(
    p_user_id     => new.user_id,
    p_type        => 'aura_received',
    p_actor_id    => new.giver_id,
    p_actor_name  => public.notification_actor_name(new.giver_id),
    p_entity_type => v_entity_type,
    p_entity_id   => v_entity_id,
    p_link        => v_link,
    p_amount      => new.delta
  );

  return new;
end;
$$;
