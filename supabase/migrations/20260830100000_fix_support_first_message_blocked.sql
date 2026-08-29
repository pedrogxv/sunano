-- Bug: a primeira mensagem de todo ticket novo era rejeitada pela trigger,
-- deixando o ticket órfão (linha criada, sem mensagem) e devolvendo
-- "Não foi possível enviar sua mensagem inicial." pro usuário.
--
-- Causa: support_tickets.waiting_on nasce com default 'admin' (20260921000016),
-- e 20260921000018 passou a levantar exceção justamente em
-- `sender_type = 'user' and waiting_on = 'admin'`. Como as duas inserções
-- (ticket + mensagem) são sequenciais e não transacionais, o ticket já estava
-- commitado quando a mensagem falhava.
--
-- waiting_on = 'admin' significa "o admin deve responder" e é o estado tanto
-- de um ticket recém-criado (nenhuma mensagem ainda) quanto de um ticket onde
-- o usuário já escreveu e aguarda. Só o segundo caso deve bloquear, então a
-- condição correta olha também quem mandou a última mensagem:
-- last_message_sender = 'user' (null num ticket novo, logo a 1ª mensagem passa).

create or replace function public.enforce_support_message_turn()
returns trigger language plpgsql as $$
declare
  v_status text;
  v_waiting_on text;
  v_last_sender text;
begin
  select status, waiting_on, last_message_sender
    into v_status, v_waiting_on, v_last_sender
    from public.support_tickets where id = new.ticket_id
    for update;

  if v_status is null then
    raise exception 'Ticket não encontrado.' using errcode = 'P0001';
  end if;

  if v_status <> 'open' then
    raise exception 'Este ticket está encerrado e não aceita novas mensagens.' using errcode = 'P0001';
  end if;

  -- Bloqueia só a 2ª mensagem consecutiva do usuário: o admin ainda deve
  -- resposta E quem falou por último foi o próprio usuário.
  if new.sender_type = 'user'
     and v_waiting_on = 'admin'
     and v_last_sender = 'user' then
    raise exception 'Aguarde a resposta do suporte antes de enviar outra mensagem.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
