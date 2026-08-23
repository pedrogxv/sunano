-- Reduz o teto de parcelas do cartão de 21 para 6 (limite de negócio da Asaas).
-- Linhas existentes acima de 6 são baixadas antes do CHECK apertar, senão a
-- migração falha em bancos que já têm store_settings com valor > 6.
update public.store_settings
  set card_max_installments = 6
  where card_max_installments > 6;

alter table public.store_settings
  alter column card_max_installments set default 6;

alter table public.store_settings
  drop constraint if exists store_settings_card_max_installments_check;
alter table public.store_settings
  add constraint store_settings_card_max_installments_check
  check (card_max_installments >= 1 and card_max_installments <= 6);
