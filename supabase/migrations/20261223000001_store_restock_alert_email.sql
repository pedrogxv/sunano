-- "Avise-me quando voltar" passa a mandar e-mail, além da notificação do site.
--
-- O banco continua decidindo QUANDO avisar (`notify_restock` grava
-- `notified_at`, 20260929000000). O e-mail sai do app (Resend), que lê as
-- inscrições avisadas e ainda sem e-mail e marca `emailed_at` antes de
-- enviar. Sem fila nova: a própria linha da inscrição é a fila.

alter table public.store_restock_alerts
  add column if not exists emailed_at timestamptz;

comment on column public.store_restock_alerts.emailed_at is
  'Quando o e-mail de "voltou ao estoque" foi enviado (ou descartado). null com notified_at preenchido = e-mail pendente.';

create index if not exists store_restock_alerts_email_pending_idx
  on public.store_restock_alerts (notified_at)
  where notified_at is not null and emailed_at is null;

-- Inscrições avisadas antes desta migration não recebem e-mail atrasado.
update public.store_restock_alerts
  set emailed_at = notified_at
  where notified_at is not null and emailed_at is null;
