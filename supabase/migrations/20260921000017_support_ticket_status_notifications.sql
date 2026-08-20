-- Notifica o dono do ticket quando o STATUS muda sem nova mensagem
-- (encerrar como resolvido/cancelado, ou reabrir) — 20260921000016 só cobre
-- notificação de mensagem nova (trg_notify_support_reply /
-- trg_notify_support_user_message), deixando closeSupportTicket e
-- reopenSupportTicket em support-repository.ts silenciosos.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'aura_received', 'post_comment', 'comment_reply', 'new_follower', 'system', 'mention',
  'new_post', 'order_status', 'support_reply', 'support_new_ticket', 'support_user_reply',
  'support_status'
));

create or replace function public.trg_notify_support_status_change()
returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  if new.status = old.status then return new; end if;

  perform public.push_notification(
    p_user_id     => new.user_id,
    p_type        => 'support_status',
    p_actor_id    => new.closed_by,
    p_entity_type => 'support_ticket',
    p_entity_id   => new.id,
    p_link        => '/conta/suporte/' || new.id,
    p_title       => new.subject,
    p_body        => new.status
  );

  return new;
end;
$$;

-- AFTER, não BEFORE: trg_support_tickets_touch (before update) já rodou e
-- gravou updated_at; separar em triggers distintos evita amarrar a lógica de
-- notificação à de auditoria de coluna.
drop trigger if exists trg_support_tickets_notify_status on public.support_tickets;
create trigger trg_support_tickets_notify_status
  after update on public.support_tickets
  for each row execute function public.trg_notify_support_status_change();
