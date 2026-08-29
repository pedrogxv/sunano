-- Limpeza dos tickets órfãos deixados pelo bug corrigido em
-- 20260830100000_fix_support_first_message_blocked.sql: a mensagem inicial era
-- rejeitada pela trigger, mas a linha do ticket (inserção anterior, sem
-- transação) ficava. Eles apareciam vazios em "Meus Tickets" e consumiam o cap
-- de 3 tickets abertos por usuário.
--
-- O critério é conservador: só apaga ticket que NÃO tem nenhuma mensagem.
-- Qualquer ticket com ao menos uma mensagem é conversa real e fica intacto.

delete from public.support_tickets t
where not exists (
  select 1 from public.support_messages m where m.ticket_id = t.id
);
