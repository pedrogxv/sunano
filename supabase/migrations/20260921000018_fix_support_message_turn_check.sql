-- Bug: enforce_support_message_turn (20260921000016) bloqueava o usuário
-- exatamente quando era a VEZ DELE (waiting_on = 'user') e liberava quando
-- não era (waiting_on = 'admin') — condição invertida. waiting_on = 'user'
-- significa "usuário deve responder" (setado por support_messages_after_insert
-- quando o admin manda mensagem), então o bloqueio deve disparar quando
-- waiting_on = 'admin', não 'user'.

create or replace function public.enforce_support_message_turn()
returns trigger language plpgsql as $$
declare
  v_status text;
  v_waiting_on text;
begin
  select status, waiting_on into v_status, v_waiting_on
    from public.support_tickets where id = new.ticket_id
    for update;

  if v_status is null then
    raise exception 'Ticket não encontrado.' using errcode = 'P0001';
  end if;

  if v_status <> 'open' then
    raise exception 'Este ticket está encerrado e não aceita novas mensagens.' using errcode = 'P0001';
  end if;

  if new.sender_type = 'user' and v_waiting_on = 'admin' then
    raise exception 'Aguarde a resposta do suporte antes de enviar outra mensagem.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
